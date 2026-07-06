import type { AudienceQuestion, RobotState } from "../types";
import type { TtsEngine } from "../hooks/useMcSession";
import { canGenerateAnswer } from "../lib/mcFlow";
import { StatusBadge } from "./StatusBadge";

const geminiVoiceOptions = [
  { value: "Leda", label: "Leda · 아이 같은 맑은 톤" },
  { value: "Puck", label: "Puck · 발랄함" },
  { value: "Zephyr", label: "Zephyr · 밝음" },
  { value: "Achird", label: "Achird · 친근함" },
  { value: "Laomedeia", label: "Laomedeia · 업비트" }
];

const elevenVoiceOptions = [
  { value: "cgSgspJ2msm6clMCkdW9", label: "Jessica · 발랄하고 밝음" },
  { value: "FGY2WhTYpPnrIDTdsKH5", label: "Laura · 햇살 같은 활기" },
  { value: "hpp4J3VqNfWAUOO0d1Us", label: "Bella · 프로페셔널 · 따뜻함" },
  { value: "EXAVITQu4vr4xnSDxMaL", label: "Sarah · 차분한 신뢰감" }
];

const engineOptions: { value: TtsEngine; label: string }[] = [
  { value: "elevenlabs", label: "ElevenLabs (기본)" },
  { value: "gemini", label: "Gemini" }
];

interface OperatorPanelProps {
  questions: AudienceQuestion[];
  selectedQuestion: AudienceQuestion | null;
  manualQuestion: string;
  draftAnswer: string;
  approvedAnswer: string;
  robotState: RobotState;
  error: string;
  isGenerating: boolean;
  isSpeaking: boolean;
  isPreparingSpeech: boolean;
  isSpeechReady: boolean;
  geminiVoice: string;
  ttsEngine: TtsEngine;
  elevenVoice: string;
  speechProvider: string;
  onSelectQuestion: (question: AudienceQuestion) => void;
  onManualQuestionChange: (value: string) => void;
  onAddManualQuestion: () => void;
  onGenerateAnswer: () => void;
  onDraftAnswerChange: (value: string) => void;
  onApproveDraft: () => void;
  onGeminiVoiceChange: (value: string) => void;
  onTtsEngineChange: (value: TtsEngine) => void;
  onElevenVoiceChange: (value: string) => void;
  onSpeak: () => void;
}

export function OperatorPanel({
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
  geminiVoice,
  ttsEngine,
  elevenVoice,
  speechProvider,
  onSelectQuestion,
  onManualQuestionChange,
  onAddManualQuestion,
  onGenerateAnswer,
  onDraftAnswerChange,
  onApproveDraft,
  onGeminiVoiceChange,
  onTtsEngineChange,
  onElevenVoiceChange,
  onSpeak
}: OperatorPanelProps) {
  const selectedText = selectedQuestion?.text || manualQuestion;
  const canGenerate = canGenerateAnswer(selectedText) && !isGenerating;
  const canApprove = draftAnswer.trim().length > 0;
  const canSpeak = approvedAnswer.trim().length > 0 && !isSpeaking;
  const speechStatus =
    isSpeechReady && speechProvider === "elevenlabs"
      ? "ElevenLabs 음색 준비 완료"
      : isSpeechReady && speechProvider === "gemini"
        ? "Gemini 음색 준비 완료"
        : isSpeechReady && speechProvider === "openai"
          ? "OpenAI 폴백 음성 준비 완료"
          : isPreparingSpeech
            ? "선택한 음색으로 미리 생성 중"
            : "답변을 만들면 자동으로 미리 준비";

  return (
    <aside className="operator-panel" aria-label="운영자 콘솔">
      <div className="operator-panel__header">
        <div>
          <p className="panel-kicker">Operator</p>
          <h2>운영자 콘솔</h2>
        </div>
        <StatusBadge state={robotState} />
      </div>

      <section className="control-section voice-section">
        <div className="section-heading">
          <h3>목소리</h3>
          <span>{ttsEngine === "elevenlabs" ? "ElevenLabs 메인" : "Gemini 메인"}</span>
        </div>
        <label className="gemini-voice-select">
          <span>음성 엔진</span>
          <select
            value={ttsEngine}
            onChange={(event) => onTtsEngineChange(event.target.value as TtsEngine)}
            aria-label="음성 엔진"
          >
            {engineOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="voice-engine-card">
          <strong>{ttsEngine === "elevenlabs" ? "ElevenLabs Multilingual v2" : "Gemini 2.5 Flash TTS"}</strong>
          <span>한 답변 안에서는 같은 음색으로 끝까지 고정</span>
        </div>
        {ttsEngine === "elevenlabs" ? (
          <label className="gemini-voice-select">
            <span>ElevenLabs 음색</span>
            <select
              value={elevenVoice}
              onChange={(event) => onElevenVoiceChange(event.target.value)}
              aria-label="ElevenLabs 음색"
            >
              {elevenVoiceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="gemini-voice-select">
            <span>Gemini 음색</span>
            <select
              value={geminiVoice}
              onChange={(event) => onGeminiVoiceChange(event.target.value)}
              aria-label="Gemini 음색"
            >
              {geminiVoiceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="voice-status" aria-live="polite">
          {speechStatus}
        </p>
      </section>

      <section className="control-section">
        <div className="section-heading">
          <h3>질문 큐</h3>
          <span>{questions.length}개</span>
        </div>
        <div className="question-list">
          {questions.map((question) => (
            <button
              className={`question-chip ${
                selectedQuestion?.id === question.id ? "question-chip--selected" : ""
              }`}
              key={question.id}
              type="button"
              onClick={() => onSelectQuestion(question)}
            >
              <span>{question.author}</span>
              {question.text}
            </button>
          ))}
        </div>
      </section>

      <section className="control-section">
        <div className="section-heading">
          <h3>직접 입력</h3>
        </div>
        <div className="manual-input-row">
          <input
            value={manualQuestion}
            onChange={(event) => onManualQuestionChange(event.target.value)}
            placeholder="현장 질문을 입력하세요"
            aria-label="현장 질문 입력"
          />
          <button type="button" onClick={onAddManualQuestion} disabled={!canGenerateAnswer(manualQuestion)}>
            추가
          </button>
        </div>
      </section>

      <section className="control-section selected-question-box">
        <div className="section-heading">
          <h3>선택된 질문</h3>
        </div>
        <p>{selectedQuestion?.text || "질문을 선택하거나 직접 입력해 주세요."}</p>
        <button className="primary-action" type="button" onClick={onGenerateAnswer} disabled={!canGenerate}>
          {isGenerating ? "답변 생성 중" : "AI 답변 생성"}
        </button>
      </section>

      <section className="control-section">
        <div className="section-heading">
          <h3>답변 승인</h3>
          <span>수정 가능</span>
        </div>
        <textarea
          value={draftAnswer}
          onChange={(event) => onDraftAnswerChange(event.target.value)}
          placeholder="AI가 만든 답변이 여기에 표시됩니다."
          aria-label="AI 답변 초안"
        />
        <div className="action-row">
          <button type="button" onClick={onApproveDraft} disabled={!canApprove}>
            승인
          </button>
          <button className="primary-action" type="button" onClick={onSpeak} disabled={!canSpeak}>
            {isSpeaking ? "말하는 중" : isPreparingSpeech ? "준비 중 · 말하기" : "로봇 말하기"}
          </button>
        </div>
      </section>

      {error ? <p className="operator-error">{error}</p> : null}
    </aside>
  );
}
