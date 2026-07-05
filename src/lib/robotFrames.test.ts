import { describe, expect, it } from "vitest";
import { mouthShapeForFrame, robotFrameForState, speakingFrameCount } from "./robotFrames";

describe("robotFrames", () => {
  it("uses a compact mouth-frame loop instead of 60 body replacement frames", () => {
    expect(speakingFrameCount).toBe(6);

    const first = robotFrameForState("speaking", 0);
    const last = robotFrameForState("speaking", 5);
    const wrapped = robotFrameForState("speaking", 6);

    expect(first.frameCount).toBe(6);
    expect(last.frameIndex).toBe(5);
    expect(wrapped.frameIndex).toBe(0);
  });

  it("keeps the speaking body on one full-body frame while mouth frames change", () => {
    const first = robotFrameForState("speaking", 0);
    const second = robotFrameForState("speaking", 5);
    const sampledKeys = [0, 1, 2, 3, 4, 5].map(
      (frame) => robotFrameForState("speaking", frame).frameKey
    );

    expect(first.frameKey).toBe("pose_point");
    expect(second.frameKey).toBe("pose_point");
    expect(sampledKeys).toEqual([
      "pose_point",
      "pose_point",
      "pose_point",
      "pose_point",
      "pose_point",
      "pose_point"
    ]);
    expect(mouthShapeForFrame(0)).toBe("closed");
    expect(mouthShapeForFrame(3)).toBe("wide");
  });

  it("keeps idle on the full-body transparent frame", () => {
    const frame = robotFrameForState("idle", 0);

    expect(frame.imageSrc).toContain("pose_idle.png");
    expect(frame.frameKey).toBe("pose_idle");
  });
});
