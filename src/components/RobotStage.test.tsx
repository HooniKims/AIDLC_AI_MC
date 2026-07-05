import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RobotState } from "../types";
import { RobotStage } from "./RobotStage";

vi.mock("./Robot3D", () => ({
  Robot3D: ({ state, lipFrame }: { state: RobotState; lipFrame?: number }) => (
    <div className="robot-canvas" data-robot-3d="true" data-state={state} data-lip-frame={lipFrame} />
  )
}));

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

describe("RobotStage 3D robot", () => {
  it("renders the 3D robot and maps lip frames to screen face cuts", () => {
    const { container, rerender } = render(
      <RobotStage state="speaking" answer="안내를 시작할게요." lipFrame={0} captionCueIndex={0} />
    );

    const wrap = container.querySelector<HTMLElement>(".robot-wrap");
    expect(container.querySelector("[data-robot-3d='true']")).not.toBeNull();
    expect(wrap?.dataset.faceKey).toBe("neutral");

    rerender(<RobotStage state="speaking" answer="안내를 시작할게요." lipFrame={2} captionCueIndex={0} />);
    expect(container.querySelector<HTMLElement>(".robot-wrap")?.dataset.faceKey).toBe("open");

    rerender(<RobotStage state="speaking" answer="안내를 시작할게요." lipFrame={3} captionCueIndex={0} />);
    expect(container.querySelector<HTMLElement>(".robot-wrap")?.dataset.faceKey).toBe("surprised");
  });

  it("does not render legacy 2D frame image or CSS mouth overlay", () => {
    const { container } = render(
      <RobotStage state="speaking" answer="안내를 시작할게요." lipFrame={5} captionCueIndex={0} />
    );

    expect(container.querySelector(".robot-image")).toBeNull();
    expect(container.querySelector(".robot-mouth")).toBeNull();
    expect(container.querySelectorAll(".robot-canvas")).toHaveLength(1);
  });

  it("keeps a calm face while idle", () => {
    const { container } = render(<RobotStage state="idle" lipFrame={0} />);
    expect(container.querySelector<HTMLElement>(".robot-wrap")?.dataset.faceKey).toBe("neutral");
  });
});
