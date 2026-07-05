import type { RobotState } from "../types";

type FrameKey =
  | "pose_idle"
  | "pose_wave"
  | "pose_think"
  | "pose_point"
  | "pose_peekaboo"
  | "pose_shy";

export interface RobotFrame {
  imageSrc: string;
  frameKey: FrameKey;
  frameIndex: number;
  frameCount: number;
  source: "preview-transparent";
}

const previewFrames: Record<FrameKey, string> = {
  pose_idle: new URL("../../assets/characters/preview-frames/pose_idle.png", import.meta.url).href,
  pose_wave: new URL("../../assets/characters/preview-frames/pose_wave.png", import.meta.url).href,
  pose_think: new URL("../../assets/characters/preview-frames/pose_think.png", import.meta.url).href,
  pose_point: new URL("../../assets/characters/preview-frames/pose_point.png", import.meta.url).href,
  pose_peekaboo: new URL("../../assets/characters/preview-frames/pose_peekaboo.png", import.meta.url).href,
  pose_shy: new URL("../../assets/characters/preview-frames/pose_shy.png", import.meta.url).href
};

const stateFrameMap: Record<RobotState, FrameKey> = {
  idle: "pose_idle",
  listening: "pose_wave",
  thinking: "pose_think",
  speaking: "pose_point"
};

const fullBodyGestureSequence: FrameKey[] = [
  "pose_point"
];

const mouthShapes = ["closed", "small", "o", "wide", "smile", "e"] as const;

export const speakingFrameCount = mouthShapes.length;

function normalizeFrameIndex(frame: number, totalFrames: number) {
  if (!Number.isFinite(frame) || totalFrames <= 0) {
    return 0;
  }

  return ((Math.floor(frame) % totalFrames) + totalFrames) % totalFrames;
}

function keyframeAt<T>(sequence: T[], frameIndex: number, totalFrames: number) {
  const index = Math.floor((frameIndex / totalFrames) * sequence.length) % sequence.length;
  return sequence[index];
}

export function mouthShapeForFrame(lipFrame = 0) {
  return mouthShapes[normalizeFrameIndex(lipFrame, mouthShapes.length)];
}

export function robotFrameForState(state: RobotState, lipFrame = 0): RobotFrame {
  if (state !== "speaking") {
    const frameKey = stateFrameMap[state];

    return {
      imageSrc: previewFrames[frameKey],
      frameKey,
      frameIndex: 0,
      frameCount: 1,
      source: "preview-transparent"
    };
  }

  const frameIndex = normalizeFrameIndex(lipFrame, speakingFrameCount);
  const frameKey = keyframeAt(fullBodyGestureSequence, frameIndex, fullBodyGestureSequence.length);

  return {
    imageSrc: previewFrames[frameKey],
    frameKey,
    frameIndex,
    frameCount: speakingFrameCount,
    source: "preview-transparent"
  };
}
