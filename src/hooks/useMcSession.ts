import { useEffect, useMemo, useRef, useState } from "react";
import { sampleQuestions } from "../data/sampleQuestions";
import { captionCueIndexForProgress, nextLipFrame, plainMcCopy } from "../lib/mcFlow";
import { speakingFaceCount } from "../lib/robotFaces";
import type { AudienceQuestion, RobotState } from "../types";

const defaultGreeting =
  "안녕하세요. 저는 디지털 러닝 콘페스타의 AI MC입니다. 여러분의 질문을 골라 담아 무대에서 또렷하게 전해드릴게요.";

const geminiVoiceStorageKey = "ai-mc-gemini-voice";
const ttsEngineStorageKey = "ai-mc-tts-engine";
const elevenVoiceStorageKey = "ai-mc-eleven-voice";

export type TtsEngine = "elevenlabs" | "gemini";
export const defaultTtsEngine: TtsEngine = "elevenlabs";

// 한국어 네이티브 음색 (ElevenLabs 라이브러리, 유료 플랜 필요)
export const elevenVoiceOptions = [
  { value: "bQlkYuipD5BHEhntA5iz", label: "JY · 상큼 발랄 업비트 (기본)" },
  { value: "OSwaPSNdfituxkWcjlkR", label: "Kano · 귀여운 애니 캐릭터" },
  { value: "Lb7qkOn5hF8p7qfCDH8q", label: "Annie · 부드럽고 귀여움" },
  { value: "6aXW46RTUz6Y2lkBGQ1a", label: "Farida · 활기차고 밝음" },
  { value: "cgSgspJ2msm6clMCkdW9", label: "Jessica · 영어권 발랄 (예비)" }
] as const;

export const defaultElevenVoiceId = elevenVoiceOptions[0].value; // JY

const engineLabels: Record<TtsEngine, string> = {
  elevenlabs: "ElevenLabs",
  gemini: "Gemini"
};

const speechPrepareDelayMs = 350;
const captionCueIntervalMs = 3600;
const speakingFrameCount = speakingFaceCount;
const speakingFrameIntervalMs = 120;

// 음량(0~1)을 입모양 사다리 프레임으로 변환: 일자 입 → 작은 O → 타원 → 활짝 D.
// 인덱스는 robotFaces의 speakingFaceSequence(입 벌어지는 크기 순)를 따른다.
function lipFrameForLevel(level: number) {
  if (level < 0.12) return 0; // neutral (다문 일자 입)
  if (level < 0.42) return 1; // surprised (작은 O)
  if (level < 0.72) return 2; // smileOpen (타원)
  return 3; // open (활짝 D)
}

// 립싱크 피크는 최근 1~2초의 음량을 따라가야 한다. 감쇠가 느리면 도입부의
// 큰 소리에 피크가 고정되어 이후 입이 계속 다문 판정이 난다 (tick당 8% 감쇠).
const lipPeakDecay = 0.92;
const lipSilenceFloor = 0.015;

interface SpeechAsset {
  key: string;
  urls: string[];
  provider: string;
}

function speechCacheKey(text: string, engine: TtsEngine, voice: string) {
  return `${engine}:${voice.trim() || "default"}::${plainMcCopy(text)}`;
}

function readStoredValue(key: string, fallback: string) {
  if (typeof window === "undefined" || !window.localStorage) {
    return fallback;
  }

  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writeStoredValue(key: string, value: string) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in private/test environments.
  }
}

export function useMcSession() {
  const [questions, setQuestions] = useState<AudienceQuestion[]>(sampleQuestions);
  const [selectedQuestion, setSelectedQuestion] = useState<AudienceQuestion | null>(sampleQuestions[0]);
  const [manualQuestion, setManualQuestion] = useState("");
  const [draftAnswer, setDraftAnswer] = useState(defaultGreeting);
  const [approvedAnswer, setApprovedAnswer] = useState(defaultGreeting);
  const [robotState, setRobotState] = useState<RobotState>("idle");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lipFrame, setLipFrame] = useState(0);
  const [captionCueIndex, setCaptionCueIndex] = useState(0);
  const [geminiVoice, setGeminiVoiceState] = useState(() => readStoredValue(geminiVoiceStorageKey, "Leda"));
  const [ttsEngine, setTtsEngineState] = useState<TtsEngine>(() => {
    const stored = readStoredValue(ttsEngineStorageKey, defaultTtsEngine);
    return stored === "gemini" ? "gemini" : "elevenlabs";
  });
  const [elevenVoice, setElevenVoiceState] = useState(() => {
    const stored = readStoredValue(elevenVoiceStorageKey, defaultElevenVoiceId);
    // 예전 세션에 저장된 폐기 음색이면 기본 음색으로 되돌린다
    return elevenVoiceOptions.some((option) => option.value === stored) ? stored : defaultElevenVoiceId;
  });
  const [isPreparingSpeech, setIsPreparingSpeech] = useState(false);
  const [speechProvider, setSpeechProvider] = useState("");
  const [preparedSpeechKey, setPreparedSpeechKey] = useState("");
  const [speechPreparationVersion, setSpeechPreparationVersion] = useState(0);
  const speechAssetRef = useRef<SpeechAsset | null>(null);
  const speechRequestRef = useRef<{ key: string; promise: Promise<SpeechAsset> } | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const lipPeakRef = useRef(0.08);
  const playingAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (robotState !== "speaking") {
      setLipFrame(0);
      return;
    }

    const id = window.setInterval(() => {
      const analyser = analyserRef.current;
      if (analyser) {
        // 실제 재생 중인 음성의 음량을 측정해 입모양을 오디오에 맞춘다
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

      // 분석기를 못 쓰는 환경에서는 기존처럼 입모양을 순환시킨다
      setLipFrame((frame) => nextLipFrame(frame, speakingFrameCount));
    }, speakingFrameIntervalMs);

    return () => window.clearInterval(id);
  }, [robotState]);

  useEffect(() => {
    if (robotState !== "speaking") {
      setCaptionCueIndex(0);
      return;
    }

    // 자막은 실제 오디오 재생 위치(currentTime/duration)를 따라간다.
    // 말이 끝나기 전에 자막이 먼저 지나가지 않도록 문장 글자 수 비중으로 매핑한다.
    const text = plainMcCopy(approvedAnswer);
    setCaptionCueIndex(0);
    let elapsedMs = 0;
    const tickMs = 200;
    const id = window.setInterval(() => {
      const audio = playingAudioRef.current;
      if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
        setCaptionCueIndex(captionCueIndexForProgress(text, audio.currentTime / audio.duration));
        return;
      }

      // 오디오 정보를 못 얻는 환경(테스트·오류)에서는 기존 시간 기반으로 진행
      elapsedMs += tickMs;
      setCaptionCueIndex(Math.floor(elapsedMs / captionCueIntervalMs));
    }, tickMs);

    return () => window.clearInterval(id);
  }, [robotState, approvedAnswer]);

  const currentQuestionText = selectedQuestion?.text || manualQuestion;

  function replaceSpeechAsset(asset: SpeechAsset) {
    const previous = speechAssetRef.current;
    if (previous) {
      previous.urls.forEach((url) => {
        if (!asset.urls.includes(url)) {
          URL.revokeObjectURL(url);
        }
      });
    }

    speechAssetRef.current = asset;
    setSpeechProvider(asset.provider);
    setPreparedSpeechKey(asset.key);
  }

  async function requestSpeechAsset(text: string, engine: TtsEngine, voice: string, signal?: AbortSignal) {
    const cleanText = plainMcCopy(text);
    const key = speechCacheKey(cleanText, engine, voice);
    const existing = speechAssetRef.current;

    if (existing?.key === key) {
      return existing;
    }

    if (speechRequestRef.current?.key === key) {
      return speechRequestRef.current.promise;
    }

    // ElevenLabs 엔진일 때는 requireProvider를 비워 서버 자동 폴백 체인
    // (ElevenLabs → Gemini → OpenAI)을 허용한다. 한 답변은 요청 1회라
    // 폴백이 일어나도 답변 중간에 목소리가 섞이지 않는다.
    // Gemini를 명시 선택한 경우에는 Gemini로 고정한다.
    const segments = [cleanText];
    const promise = Promise.all(
      segments.map(async (segment) => {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: segment,
            geminiVoice: engine === "gemini" ? voice : undefined,
            elevenVoice: engine === "elevenlabs" ? voice : undefined,
            requireProvider: engine === "gemini" ? "gemini" : undefined
          }),
          signal
        });

        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload.error || "음성 생성에 실패했습니다.");
        }

        const blob = await response.blob();
        return {
          url: URL.createObjectURL(blob),
          provider: response.headers.get("X-AI-MC-TTS-Provider") || ""
        };
      })
    ).then((segments) => {
      const providers = segments.map((segment) => segment.provider).filter(Boolean);
      const provider = providers.every((provider) => provider === providers[0]) ? providers[0] || "" : "mixed";
      const providerAllowed = engine === "gemini" ? provider === "gemini" : provider !== "mixed" && provider !== "";
      if (!providerAllowed) {
        segments.forEach((segment) => URL.revokeObjectURL(segment.url));
        throw new Error(
          `${engineLabels[engine]} 음성 준비에 실패했습니다. 음성이 섞이지 않도록 재생을 중단했습니다.`
        );
      }

      const asset = {
        key,
        urls: segments.map((segment) => segment.url),
        provider
      };

      replaceSpeechAsset(asset);
      return asset;
    });

    speechRequestRef.current = { key, promise };

    try {
      return await promise;
    } finally {
      if (speechRequestRef.current?.key === key) {
        speechRequestRef.current = null;
      }
    }
  }

  useEffect(() => {
    if (speechPreparationVersion === 0) {
      setIsPreparingSpeech(false);
      return;
    }

    const text = plainMcCopy(approvedAnswer);
    if (!text) {
      setIsPreparingSpeech(false);
      return;
    }

    const activeVoice = ttsEngine === "elevenlabs" ? elevenVoice : geminiVoice;
    const key = speechCacheKey(text, ttsEngine, activeVoice);
    if (speechAssetRef.current?.key === key) {
      setIsPreparingSpeech(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setIsPreparingSpeech(true);
      requestSpeechAsset(text, ttsEngine, activeVoice, controller.signal)
        .catch((caught) => {
          if (!(caught instanceof DOMException && caught.name === "AbortError")) {
            setSpeechProvider("");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsPreparingSpeech(false);
          }
        });
    }, speechPrepareDelayMs);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [approvedAnswer, geminiVoice, elevenVoice, ttsEngine, speechPreparationVersion]);

  useEffect(() => {
    return () => {
      if (speechAssetRef.current) {
        speechAssetRef.current.urls.forEach((url) => URL.revokeObjectURL(url));
      }
    };
  }, []);

  function setGeminiVoice(value: string) {
    setGeminiVoiceState(value);
    writeStoredValue(geminiVoiceStorageKey, value);
    setError("");
  }

  function setTtsEngine(value: TtsEngine) {
    setTtsEngineState(value);
    writeStoredValue(ttsEngineStorageKey, value);
    setError("");
  }

  function setElevenVoice(value: string) {
    setElevenVoiceState(value);
    writeStoredValue(elevenVoiceStorageKey, value);
    setError("");
  }

  function selectQuestion(question: AudienceQuestion) {
    setSelectedQuestion(question);
    setManualQuestion("");
    setDraftAnswer("");
    setApprovedAnswer("");
    setError("");
    setRobotState("listening");
  }

  function addManualQuestion() {
    const text = manualQuestion.trim();
    if (!text) {
      return;
    }

    const question: AudienceQuestion = {
      id: `manual-${Date.now()}`,
      text,
      author: "운영자 입력",
      status: "queued"
    };
    setQuestions((items) => [question, ...items]);
    selectQuestion(question);
  }

  async function generateAnswer() {
    const question = currentQuestionText.trim();
    if (!question) {
      return;
    }

    setIsGenerating(true);
    setRobotState("thinking");
    setError("");

    try {
      const response = await fetch("/api/generate-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "답변 생성에 실패했습니다.");
      }

      const answer = plainMcCopy(payload.answer || "");
      setDraftAnswer(answer);
      if (answer) {
        setApprovedAnswer(answer);
        setSpeechPreparationVersion((version) => version + 1);
      }
      setRobotState("listening");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "답변 생성에 실패했습니다.");
      setRobotState("listening");
    } finally {
      setIsGenerating(false);
    }
  }

  function approveDraft() {
    const answer = plainMcCopy(draftAnswer);
    if (!answer) {
      return;
    }

    setApprovedAnswer(answer);
    setSpeechPreparationVersion((version) => version + 1);
    setError("");
  }

  function finishSpeaking() {
    setIsSpeaking(false);
    setRobotState("idle");
  }

  // 재생 오디오에 WebAudio 분석기를 연결해 립싱크가 실제 음량을 따라가게 한다.
  // 컨텍스트가 running 상태일 때만 오디오를 재라우팅해, 실패 시에도 소리는 그대로 나온다.
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

  async function playSpeechAsset(asset: SpeechAsset) {
    for (const url of asset.urls) {
      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(url);
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
    }
  }

  async function speak() {
    const text = plainMcCopy(approvedAnswer);
    if (!text) {
      return;
    }

    setIsSpeaking(true);
    setRobotState("speaking");
    setError("");

    try {
      const activeVoice = ttsEngine === "elevenlabs" ? elevenVoice : geminiVoice;
      const asset = await requestSpeechAsset(text, ttsEngine, activeVoice);
      await playSpeechAsset(asset);
      finishSpeaking();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "음성 생성에 실패했습니다.");
      window.setTimeout(finishSpeaking, 2600);
    }
  }

  const draftSpeechText = plainMcCopy(draftAnswer);
  const activeSpeechVoice = ttsEngine === "elevenlabs" ? elevenVoice : geminiVoice;
  const draftSpeechKey = draftSpeechText ? speechCacheKey(draftSpeechText, ttsEngine, activeSpeechVoice) : "";
  const isSpeechReady = Boolean(draftSpeechKey && preparedSpeechKey === draftSpeechKey);

  return useMemo(
    () => ({
      questions,
      selectedQuestion,
      manualQuestion,
      draftAnswer,
      approvedAnswer,
      robotState,
      error,
      isGenerating,
      isSpeaking,
      isPreparingSpeech,
      isSpeechReady,
      lipFrame,
      captionCueIndex,
      geminiVoice,
      ttsEngine,
      elevenVoice,
      speechProvider,
      currentQuestionText,
      selectQuestion,
      setManualQuestion,
      addManualQuestion,
      generateAnswer,
      setDraftAnswer,
      approveDraft,
      setGeminiVoice,
      setTtsEngine,
      setElevenVoice,
      speak
    }),
    [
      questions,
      selectedQuestion,
      manualQuestion,
      draftAnswer,
      approvedAnswer,
      robotState,
      error,
      isGenerating,
      isSpeaking,
      isPreparingSpeech,
      isSpeechReady,
      lipFrame,
      captionCueIndex,
      geminiVoice,
      ttsEngine,
      elevenVoice,
      speechProvider,
      currentQuestionText
    ]
  );
}
