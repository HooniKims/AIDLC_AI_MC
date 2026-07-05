import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RobotStage } from "./RobotStage";

describe("RobotStage captions", () => {
  it("shows one sentence instead of the full answer while speaking", () => {
    const { container } = render(
      <RobotStage
        state="speaking"
        answer="첫 번째 안내입니다. 두 번째 안내입니다. 세 번째 안내입니다."
        captionCueIndex={0}
      />
    );

    const caption = container.querySelector(".stage-answer");
    expect(caption?.textContent).toContain("첫 번째 안내입니다.");
    expect(caption?.textContent).not.toContain("두 번째 안내입니다.");
    expect(caption?.textContent).not.toContain("세 번째 안내입니다.");
  });

  it("advances the visible subtitle chunk by cue index", () => {
    const { container } = render(
      <RobotStage
        state="speaking"
        answer="첫 번째 안내입니다. 두 번째 안내입니다. 세 번째 안내입니다."
        captionCueIndex={1}
      />
    );

    const caption = container.querySelector(".stage-answer");
    expect(caption?.textContent).not.toContain("첫 번째 안내입니다.");
    expect(caption?.textContent).toContain("두 번째 안내입니다.");
    expect(caption?.textContent).not.toContain("세 번째 안내입니다.");
  });

  it("does not show the full answer after speaking captions are exhausted", () => {
    const { container } = render(
      <RobotStage
        state="speaking"
        answer="첫 번째 안내입니다. 두 번째 안내입니다. 세 번째 안내입니다."
        captionCueIndex={3}
      />
    );

    expect(container.querySelector(".stage-answer")).toBeNull();
  });

  it("does not show the full approved answer while idle", () => {
    const { container } = render(
      <RobotStage
        state="idle"
        answer="첫 번째 안내입니다. 두 번째 안내입니다. 세 번째 안내입니다."
      />
    );

    expect(container.querySelector(".stage-answer")).toBeNull();
  });
});

describe("RobotStage character frames", () => {
  it("keeps the full-body image stable while changing only the mouth shape", () => {
    const { container, rerender } = render(
      <RobotStage state="speaking" answer="안내를 시작할게요." lipFrame={0} captionCueIndex={0} />
    );

    const firstImage = container.querySelector<HTMLImageElement>(".robot-image");
    const firstSrc = firstImage?.src;
    const firstMouth = container.querySelector<HTMLElement>(".robot-mouth");
    expect(firstImage?.dataset.frameTotal).toBe("6");
    expect(firstImage?.dataset.frameIndex).toBe("0");
    expect(firstImage?.dataset.frameKey).toBe("pose_point");
    expect(firstImage?.src).toContain("preview-frames");
    expect(firstMouth?.dataset.mouthShape).toBe("closed");

    rerender(<RobotStage state="speaking" answer="안내를 시작할게요." lipFrame={3} captionCueIndex={0} />);

    const laterImage = container.querySelector<HTMLImageElement>(".robot-image");
    const laterMouth = container.querySelector<HTMLElement>(".robot-mouth");
    expect(laterImage?.src).toBe(firstSrc);
    expect(laterImage?.dataset.frameIndex).toBe("3");
    expect(laterImage?.dataset.frameKey).toBe("pose_point");
    expect(laterMouth?.dataset.mouthShape).toBe("wide");
  });

  it("does not layer a separate face image over the full-body frame", () => {
    const { container } = render(
      <RobotStage state="speaking" answer="안내를 시작할게요." lipFrame={5} captionCueIndex={0} />
    );

    expect(container.querySelectorAll(".robot-image")).toHaveLength(1);
    expect(container.querySelector(".robot-face-frame")).toBeNull();
    expect(container.querySelector(".robot-mouth")).not.toBeNull();
  });
});
