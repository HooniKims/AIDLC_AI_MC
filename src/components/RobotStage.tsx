import type { RobotState } from "../types";
import { StatusBadge } from "./StatusBadge";
import { ConfestaBackdrop } from "./ConfestaBackdrop";
import { Robot3D } from "./Robot3D";
import { stageCaptionLinesForKorean } from "../lib/mcFlow";
import { faceForFrame } from "../lib/robotFaces";

interface RobotStageProps {
  state: RobotState;
  question?: string;
  answer?: string;
  lipFrame?: number;
  captionCueIndex?: number;
  variant?: "full" | "preview" | "compact";
}

export function RobotStage({
  state,
  question,
  answer,
  lipFrame = 0,
  captionCueIndex = 0,
  variant = "preview"
}: RobotStageProps) {
  const isSpeaking = state === "speaking";
  const faceKey = faceForFrame(state, lipFrame);
  const displayAnswer =
    answer || "안녕하세요. 저는 디지털 러닝 콘페스타의 AI MC입니다. 오늘의 배움 여정을 함께 안내할게요.";
  const answerLines = stageCaptionLinesForKorean(displayAnswer, {
    cueIndex: captionCueIndex,
    isSpeaking,
    maxChars: variant === "full" ? 34 : 28,
    maxLines: 2
  });
  // 수동 글자수 분할 + CSS 자동 줄바꿈이 겹치면 어색한 이중 줄바꿈이 생긴다.
  // 한 문단으로 합치고 줄바꿈은 CSS(keep-all + balance)에 맡긴다.
  const answerText = answerLines.join(" ");
  const shouldShowAnswer = isSpeaking && answerText.length > 0;

  return (
    <section className={`robot-stage robot-stage--${variant}`} aria-label="AI MC 무대">
      <ConfestaBackdrop mode={variant === "full" ? "full" : "preview"} />
      <div className="stage-topline">
        <div>
          <p className="stage-kicker">2026 AI·디지털 러닝 콘페스타</p>
          <h1>AI MC</h1>
        </div>
        <StatusBadge state={state} />
      </div>

      <div
        className={`robot-wrap robot-wrap--3d robot-wrap--${state}`}
        data-face-key={faceKey}
        data-lip-frame={lipFrame}
      >
        <div className="robot-glow" />
        <Robot3D state={state} lipFrame={lipFrame} />
        {isSpeaking ? <span className="voice-pulse pulse-one" aria-hidden="true" /> : null}
        {isSpeaking ? <span className="voice-pulse pulse-two" aria-hidden="true" /> : null}
      </div>

      <div className="stage-caption" aria-live="polite">
        {question ? <p className="stage-question">Q. {question}</p> : null}
        {shouldShowAnswer ? (
          <p
            key={answerText}
            className="stage-answer stage-answer--speaking"
            data-caption-cue={captionCueIndex}
          >
            {answerText}
          </p>
        ) : null}
      </div>
    </section>
  );
}
