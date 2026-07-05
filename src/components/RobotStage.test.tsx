import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RobotStage } from "./RobotStage";

describe("RobotStage captions", () => {
  it("shows one subtitle chunk instead of the full answer while speaking", () => {
    const { container } = render(
      <RobotStage
        state="speaking"
        answer="첫 번째 안내입니다. 두 번째 안내입니다. 세 번째 안내입니다."
        captionCueIndex={0}
      />
    );

    const caption = container.querySelector(".stage-answer");
    expect(caption?.textContent).toContain("첫 번째 안내입니다.");
    expect(caption?.textContent).toContain("두 번째 안내입니다.");
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
    expect(caption?.textContent).toContain("세 번째 안내입니다.");
  });
});
