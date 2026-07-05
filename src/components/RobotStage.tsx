import type { RobotState } from "../types";
import { StatusBadge } from "./StatusBadge";
import { ConfestaBackdrop } from "./ConfestaBackdrop";

const poseImages: Record<RobotState, string> = {
  idle: new URL("../../assets/characters/generated/pose-idle.png", import.meta.url).href,
  listening: new URL("../../assets/characters/generated/pose-listen.png", import.meta.url).href,
  thinking: new URL("../../assets/characters/generated/pose-think.png", import.meta.url).href,
  speaking: new URL("../../assets/characters/generated/pose-explain.png", import.meta.url).href
};

const mouthShapes = ["closed", "small", "wide", "smile", "o", "e"];

interface RobotStageProps {
  state: RobotState;
  question?: string;
  answer?: string;
  lipFrame?: number;
  variant?: "full" | "preview" | "compact";
}

export function RobotStage({
  state,
  question,
  answer,
  lipFrame = 0,
  variant = "preview"
}: RobotStageProps) {
  const isSpeaking = state === "speaking";
  const mouthShape = mouthShapes[lipFrame % mouthShapes.length];

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
        <img className="robot-image" src={poseImages[state]} alt="AI MC 로봇 캐릭터" draggable="false" />
        <span className={`robot-mouth robot-mouth--${mouthShape}`} aria-hidden="true" />
        {isSpeaking ? <span className="voice-pulse pulse-one" aria-hidden="true" /> : null}
        {isSpeaking ? <span className="voice-pulse pulse-two" aria-hidden="true" /> : null}
      </div>

      <div className="stage-caption" aria-live="polite">
        {question ? <p className="stage-question">Q. {question}</p> : null}
        <p className="stage-answer">
          {answer ||
            "안녕하세요. 저는 디지털 러닝 콘페스타의 AI MC입니다. 오늘의 배움 여정을 함께 안내할게요."}
        </p>
      </div>
    </section>
  );
}
