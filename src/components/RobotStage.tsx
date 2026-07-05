import type { RobotState } from "../types";
import { StatusBadge } from "./StatusBadge";
import { ConfestaBackdrop } from "./ConfestaBackdrop";
import { stageCaptionLinesForKorean } from "../lib/mcFlow";
import { mouthShapeForFrame, robotFrameForState } from "../lib/robotFrames";

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
  const activeFrame = robotFrameForState(state, lipFrame);
  const mouthShape = mouthShapeForFrame(lipFrame);
  const displayAnswer =
    answer || "안녕하세요. 저는 디지털 러닝 콘페스타의 AI MC입니다. 오늘의 배움 여정을 함께 안내할게요.";
  const answerLines = stageCaptionLinesForKorean(displayAnswer, {
    cueIndex: captionCueIndex,
    isSpeaking,
    maxChars: variant === "full" ? 34 : 28,
    maxLines: 2
  });
  const shouldShowAnswer = isSpeaking && answerLines.length > 0;

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

      <div className={`robot-wrap robot-wrap--${state}`}>
        <div className="robot-glow" />
        <img
          className="robot-image"
          src={activeFrame.imageSrc}
          alt="AI MC 로봇 프레임 캐릭터"
          draggable="false"
          data-character-source={activeFrame.source}
          data-frame-key={activeFrame.frameKey}
          data-frame-index={activeFrame.frameIndex}
          data-frame-total={activeFrame.frameCount}
        />
        {isSpeaking ? (
          <span
            className={`robot-mouth robot-mouth--${mouthShape}`}
            data-mouth-shape={mouthShape}
            aria-hidden="true"
          />
        ) : null}
        {isSpeaking ? <span className="voice-pulse pulse-one" aria-hidden="true" /> : null}
        {isSpeaking ? <span className="voice-pulse pulse-two" aria-hidden="true" /> : null}
      </div>

      <div className="stage-caption" aria-live="polite">
        {question ? <p className="stage-question">Q. {question}</p> : null}
        {shouldShowAnswer ? (
          <p
            key={captionCueIndex}
            className="stage-answer stage-answer--speaking"
            data-caption-cue={captionCueIndex}
          >
            {answerLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </p>
        ) : null}
      </div>
    </section>
  );
}
