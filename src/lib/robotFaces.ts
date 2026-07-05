import type { RobotState } from "../types";

export type FaceKey =
  | "neutral"
  | "slight"
  | "open"
  | "smileOpen"
  | "happyClosed"
  | "surprised";

export const faceTextureUrls: Record<FaceKey, string> = {
  neutral: "/faces/face_neutral.png",
  slight: "/faces/face_slight.png",
  open: "/faces/face_open.png",
  smileOpen: "/faces/face_smile_open.png",
  happyClosed: "/faces/face_happy_closed.png",
  surprised: "/faces/face_surprised.png"
};

// 기존 2D 입모양 순서(closed, small, o, wide, smile, e)에 대응하는 스크린 얼굴 컷
const speakingFaceSequence: FaceKey[] = [
  "neutral",
  "slight",
  "open",
  "surprised",
  "smileOpen",
  "slight"
];

export const speakingFaceCount = speakingFaceSequence.length;

const stateFaceMap: Record<RobotState, FaceKey> = {
  idle: "neutral",
  listening: "smileOpen",
  thinking: "slight",
  speaking: "neutral"
};

export function faceForFrame(state: RobotState, lipFrame = 0, blinking = false): FaceKey {
  if (blinking) {
    return "happyClosed";
  }

  if (state !== "speaking") {
    return stateFaceMap[state];
  }

  if (!Number.isFinite(lipFrame)) {
    return speakingFaceSequence[0];
  }

  const total = speakingFaceSequence.length;
  const index = ((Math.floor(lipFrame) % total) + total) % total;
  return speakingFaceSequence[index];
}
