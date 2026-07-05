import { useEffect, useMemo, useState } from "react";
import { sampleQuestions } from "../data/sampleQuestions";
import { nextLipFrame } from "../lib/mcFlow";
import type { AudienceQuestion, RobotState } from "../types";

const defaultGreeting =
  "안녕하세요. 저는 디지털 러닝 콘페스타의 AI MC입니다. 여러분의 질문을 골라 담아 무대에서 또렷하게 전해드릴게요.";

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

  useEffect(() => {
    if (robotState !== "speaking") {
      setLipFrame(0);
      return;
    }

    const id = window.setInterval(() => {
      setLipFrame((frame) => nextLipFrame(frame, 6));
    }, 130);

    return () => window.clearInterval(id);
  }, [robotState]);

  const currentQuestionText = selectedQuestion?.text || manualQuestion;

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

      setDraftAnswer(payload.answer);
      setRobotState("listening");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "답변 생성에 실패했습니다.");
      setRobotState("listening");
    } finally {
      setIsGenerating(false);
    }
  }

  function approveDraft() {
    const answer = draftAnswer.trim();
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

  async function speak() {
    const text = approvedAnswer.trim();
    if (!text) {
      return;
    }

    setIsSpeaking(true);
    setRobotState("speaking");
    setError("");

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "음성 생성에 실패했습니다.");
      }

      const blob = await response.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audio.onended = finishSpeaking;
      audio.onerror = finishSpeaking;
      await audio.play();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "음성 생성에 실패했습니다.");
      window.setTimeout(finishSpeaking, 2600);
    }
  }

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
      lipFrame,
      currentQuestionText,
      selectQuestion,
      setManualQuestion,
      addManualQuestion,
      generateAnswer,
      setDraftAnswer,
      approveDraft,
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
      lipFrame,
      currentQuestionText
    ]
  );
}
