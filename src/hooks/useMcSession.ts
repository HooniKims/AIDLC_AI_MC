import { useEffect, useMemo, useRef, useState } from "react";
import { sampleQuestions } from "../data/sampleQuestions";
import { nextLipFrame, plainMcCopy } from "../lib/mcFlow";
import type { AudienceQuestion, RobotState } from "../types";

const defaultGreeting =
  "안녕하세요. 저는 디지털 러닝 콘페스타의 AI MC입니다. 여러분의 질문을 골라 담아 무대에서 또렷하게 전해드릴게요.";

const geminiVoiceStorageKey = "ai-mc-gemini-voice";
const speechPrepareDelayMs = 350;

interface SpeechAsset {
  key: string;
  urls: string[];
  provider: string;
}

function speechCacheKey(text: string, voice: string) {
  return `${voice.trim() || "default"}::${plainMcCopy(text)}`;
}

function speechSegmentsForKorean(text: string): string[] {
  const cleanText = plainMcCopy(text).replace(/\s+/g, " ").trim();
  if (!cleanText) {
    return [];
  }

  const sentences = cleanText.match(/[^.!?。！？]+[.!?。！？]?/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [
    cleanText
  ];

  if (sentences.length <= 3) {
    return sentences;
  }

  return [sentences[0], sentences[1], sentences.slice(2).join(" ")];
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
  const [geminiVoice, setGeminiVoiceState] = useState(() => readStoredValue(geminiVoiceStorageKey, "Leda"));
  const [isPreparingSpeech, setIsPreparingSpeech] = useState(false);
  const [speechProvider, setSpeechProvider] = useState("");
  const [preparedSpeechKey, setPreparedSpeechKey] = useState("");
  const speechAssetRef = useRef<SpeechAsset | null>(null);
  const speechRequestRef = useRef<{ key: string; promise: Promise<SpeechAsset> } | null>(null);

  useEffect(() => {
    if (robotState !== "speaking") {
      setLipFrame(0);
      return;
    }

    const id = window.setInterval(() => {
      setLipFrame((frame) => nextLipFrame(frame, 12));
    }, 130);

    return () => window.clearInterval(id);
  }, [robotState]);

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

  async function requestSpeechAsset(text: string, voice: string, signal?: AbortSignal) {
    const cleanText = plainMcCopy(text);
    const key = speechCacheKey(cleanText, voice);
    const existing = speechAssetRef.current;

    if (existing?.key === key) {
      return existing;
    }

    if (speechRequestRef.current?.key === key) {
      return speechRequestRef.current.promise;
    }

    const segments = speechSegmentsForKorean(cleanText);
    const promise = Promise.all(
      segments.map(async (segment) => {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: segment,
            geminiVoice: voice
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
    const text = plainMcCopy(draftAnswer);
    if (!text) {
      setIsPreparingSpeech(false);
      return;
    }

    const key = speechCacheKey(text, geminiVoice);
    if (speechAssetRef.current?.key === key) {
      setIsPreparingSpeech(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setIsPreparingSpeech(true);
      requestSpeechAsset(text, geminiVoice, controller.signal)
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
  }, [draftAnswer, geminiVoice]);

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

  function selectQuestion(question: AudienceQuestion) {
    setSelectedQuestion(question);
    setManualQuestion("");
    setDraftAnswer("");
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

      setDraftAnswer(plainMcCopy(payload.answer || ""));
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
    setError("");
  }

  function finishSpeaking() {
    setIsSpeaking(false);
    setRobotState("idle");
  }

  async function playSpeechAsset(asset: SpeechAsset) {
    for (const url of asset.urls) {
      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(url);
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(reject);
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
      const asset = await requestSpeechAsset(text, geminiVoice);
      await playSpeechAsset(asset);
      finishSpeaking();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "음성 생성에 실패했습니다.");
      window.setTimeout(finishSpeaking, 2600);
    }
  }

  const draftSpeechText = plainMcCopy(draftAnswer);
  const draftSpeechKey = draftSpeechText ? speechCacheKey(draftSpeechText, geminiVoice) : "";
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
      geminiVoice,
      speechProvider,
      currentQuestionText,
      selectQuestion,
      setManualQuestion,
      addManualQuestion,
      generateAnswer,
      setDraftAnswer,
      approveDraft,
      setGeminiVoice,
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
      geminiVoice,
      speechProvider,
      currentQuestionText
    ]
  );
}
