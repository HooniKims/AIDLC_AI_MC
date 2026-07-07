import { useCallback, useEffect, useRef, useState } from "react";
import {
  captionCueBoundaryFractions,
  captionCueCount,
  captionCueIndexForProgress,
  captionCueIndexForTimes,
  nextLipFrame,
  parseCaptionTimesHeader,
  plainMcCopy
} from "../lib/mcFlow";
import { captionTimesFromAudioSamples } from "../lib/captionAudioSync";
import { speakingFaceCount } from "../lib/robotFaces";
import type { RobotState } from "../types";
import { authedFetch } from "../lib/operatorAuth";

// 무대 재생은 Gemini(Leda) 고정. 운영자 최종 결정 음색이며, 서버 기본과 일치.
// (엔진/음색 원격 선택이 필요해지면 Firestore control 문서로 확장 가능)
const STAGE_ENGINE = "gemini" as const;
const STAGE_VOICE = "Leda";

const speakingFrameCount = speakingFaceCount;
const speakingFrameIntervalMs = 120;
const captionCueIntervalMs = 3600;
const lipPeakDecay = 0.92;
const lipSilenceFloor = 0.015;

function lipFrameForLevel(level: number) {
  if (level < 0.12) return 0;
  if (level < 0.42) return 1;
  if (level < 0.72) return 2;
  return 3;
}

interface SpeechAsset {
  key: string;
  url: string;
  provider: string;
  captionTimes: number[] | null;
}

function cacheKey(text: string) {
  return `${STAGE_ENGINE}:${STAGE_VOICE}::${plainMcCopy(text)}`;
}

export interface StagePlayer {
  robotState: RobotState;
  lipFrame: number;
  captionCueIndex: number;
  isSpeaking: boolean;
  spokenText: string;
  // 브라우저 자동재생 차단으로 소리를 못 낸 상태 (화면 클릭으로 해제)
  audioBlocked: boolean;
  retryBlocked: () => void;
  prepare: (text: string) => void;
  play: (text: string) => Promise<void>;
}

export function useStagePlayer(): StagePlayer {
  const [robotState, setRobotState] = useState<RobotState>("idle");
  const [lipFrame, setLipFrame] = useState(0);
  const [captionCueIndex, setCaptionCueIndex] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [spokenText, setSpokenText] = useState("");
  const [audioBlocked, setAudioBlocked] = useState(false);
  const blockedTextRef = useRef<string | null>(null);

  const cacheRef = useRef<Map<string, SpeechAsset>>(new Map());
  const pendingRef = useRef<Map<string, Promise<SpeechAsset>>>(new Map());
  const activeAssetRef = useRef<SpeechAsset | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const lipPeakRef = useRef(0.08);
  const playingAudioRef = useRef<HTMLAudioElement | null>(null);

  // 입모양: 재생 오디오의 실제 음량(RMS)을 측정해 사다리 프레임으로 변환
  useEffect(() => {
    if (robotState !== "speaking") {
      setLipFrame(0);
      return;
    }
    const id = window.setInterval(() => {
      const analyser = analyserRef.current;
      if (analyser) {
        const samples = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
          const value = (samples[i] - 128) / 128;
          sum += value * value;
        }
        const rms = Math.sqrt(sum / samples.length);
        lipPeakRef.current = Math.max(lipPeakRef.current * lipPeakDecay, rms, 0.04);
        const level = rms < lipSilenceFloor ? 0 : rms / lipPeakRef.current;
        setLipFrame(lipFrameForLevel(level));
        return;
      }
      setLipFrame((frame) => nextLipFrame(frame, speakingFrameCount));
    }, speakingFrameIntervalMs);
    return () => window.clearInterval(id);
  }, [robotState]);

  // 자막: 재생 위치를 따라간다. 타임스탬프 있으면 문장 종료 시각, 없으면 글자수 근사.
  useEffect(() => {
    if (robotState !== "speaking") {
      setCaptionCueIndex(0);
      return;
    }
    const text = plainMcCopy(spokenText);
    setCaptionCueIndex(0);
    let audioSeen = false;
    let elapsedMs = 0;
    const tickMs = 120;
    const id = window.setInterval(() => {
      const audio = playingAudioRef.current;
      if (audio) {
        audioSeen = true;
        const captionTimes = activeAssetRef.current?.captionTimes;
        if (captionTimes && captionTimes.length > 0) {
          setCaptionCueIndex(captionCueIndexForTimes(captionTimes, audio.currentTime));
          return;
        }
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          setCaptionCueIndex(captionCueIndexForProgress(text, audio.currentTime / audio.duration));
          return;
        }
      }
      if (!audioSeen) {
        setCaptionCueIndex(0);
        return;
      }
      elapsedMs += tickMs;
      const maxCue = Math.max(0, captionCueCount(text) - 1);
      setCaptionCueIndex(Math.min(Math.floor(elapsedMs / captionCueIntervalMs), maxCue));
    }, tickMs);
    return () => window.clearInterval(id);
  }, [robotState, spokenText]);

  useEffect(() => {
    return () => {
      cacheRef.current.forEach((asset) => URL.revokeObjectURL(asset.url));
      cacheRef.current.clear();
    };
  }, []);

  async function analyzeCaptionTimes(blob: Blob, text: string): Promise<number[] | null> {
    try {
      if (typeof window === "undefined" || !("AudioContext" in window)) {
        return null;
      }
      const fractions = captionCueBoundaryFractions(text);
      if (fractions.length === 0) {
        return null;
      }
      const context = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = context;
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      return captionTimesFromAudioSamples(
        decoded.getChannelData(0),
        decoded.sampleRate,
        fractions,
        decoded.duration
      );
    } catch {
      return null;
    }
  }

  const fetchAsset = useCallback((text: string): Promise<SpeechAsset> => {
    const clean = plainMcCopy(text);
    const key = cacheKey(clean);
    const cached = cacheRef.current.get(key);
    if (cached) {
      return Promise.resolve(cached);
    }
    const inflight = pendingRef.current.get(key);
    if (inflight) {
      return inflight;
    }

    const promise = (async () => {
      const response = await authedFetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: clean,
          geminiVoice: STAGE_VOICE,
          requireProvider: STAGE_ENGINE
        })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "음성 생성에 실패했습니다.");
      }
      const blob = await response.blob();
      const asset: SpeechAsset = {
        key,
        url: URL.createObjectURL(blob),
        provider: response.headers.get("X-AI-MC-TTS-Provider") || "",
        captionTimes: parseCaptionTimesHeader(response.headers.get("X-AI-MC-Caption-Times"))
      };
      cacheRef.current.set(key, asset);
      if (!asset.captionTimes) {
        void analyzeCaptionTimes(blob, clean).then((times) => {
          if (times) {
            asset.captionTimes = times;
          }
        });
      }
      return asset;
    })();

    pendingRef.current.set(key, promise);
    promise.finally(() => {
      if (pendingRef.current.get(key) === promise) {
        pendingRef.current.delete(key);
      }
    });
    return promise;
  }, []);

  // 다가올 답변 오디오를 미리 받아 캐시(무음 분석까지). 실패는 조용히 무시.
  const prepare = useCallback(
    (text: string) => {
      const clean = plainMcCopy(text);
      if (!clean) {
        return;
      }
      void fetchAsset(clean).catch(() => undefined);
    },
    [fetchAsset]
  );

  function attachLipSyncAnalyser(audio: HTMLAudioElement) {
    try {
      if (typeof window === "undefined" || !("AudioContext" in window)) {
        return;
      }
      const context = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = context;
      const connect = () => {
        try {
          const source = context.createMediaElementSource(audio);
          const analyser = context.createAnalyser();
          analyser.fftSize = 512;
          source.connect(analyser);
          analyser.connect(context.destination);
          analyserRef.current = analyser;
        } catch {
          analyserRef.current = null;
        }
      };
      if (context.state === "running") {
        connect();
      } else {
        context
          .resume()
          .then(connect)
          .catch(() => {
            analyserRef.current = null;
          });
      }
    } catch {
      analyserRef.current = null;
    }
  }

  const play = useCallback(
    async (text: string) => {
      const clean = plainMcCopy(text);
      if (!clean) {
        return;
      }
      // 오디오가 준비된 뒤에만 말하기 상태로 전환한다.
      // 프리페치가 안 된 항목은 Gemini 생성에 10~20초가 걸리는데, 먼저 speaking으로
      // 들어가면 그동안 로봇이 소리 없이 입만 움직인다 (실측으로 확인된 사고).
      // 준비 중에는 thinking 상태로 대기 연출을 유지한다.
      setRobotState("thinking");
      let asset;
      try {
        asset = await fetchAsset(clean);
      } catch (caught) {
        setRobotState("idle");
        throw caught;
      }
      setSpokenText(clean);
      setIsSpeaking(true);
      setRobotState("speaking");
      try {
        activeAssetRef.current = asset;
        await new Promise<void>((resolve, reject) => {
          const audio = new Audio(asset.url);
          attachLipSyncAnalyser(audio);
          playingAudioRef.current = audio;
          const finish = () => {
            analyserRef.current = null;
            playingAudioRef.current = null;
            resolve();
          };
          audio.onended = finish;
          audio.onerror = finish;
          audio.play().catch((caught) => {
            analyserRef.current = null;
            playingAudioRef.current = null;
            reject(caught);
          });
        });
        setAudioBlocked(false);
        blockedTextRef.current = null;
      } catch (caught) {
        // 브라우저 자동재생 정책 차단: 화면 클릭 한 번으로 재시도할 수 있게 기억해 둔다
        if ((caught as DOMException)?.name === "NotAllowedError") {
          blockedTextRef.current = clean;
          setAudioBlocked(true);
        }
        throw caught;
      } finally {
        setIsSpeaking(false);
        setRobotState("idle");
      }
    },
    [fetchAsset]
  );

  // 자동재생 차단 해제: 사용자 클릭(제스처) 안에서 재생을 다시 시도한다
  const retryBlocked = useCallback(() => {
    const text = blockedTextRef.current;
    if (!text) {
      setAudioBlocked(false);
      return;
    }
    setAudioBlocked(false);
    void play(text).catch(() => undefined);
  }, [play]);

  return {
    robotState,
    lipFrame,
    captionCueIndex,
    isSpeaking,
    spokenText,
    audioBlocked,
    retryBlocked,
    prepare,
    play
  };
}
