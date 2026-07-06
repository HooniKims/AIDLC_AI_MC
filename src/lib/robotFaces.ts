import type { RobotState } from "../types";

export type FaceKey =
  | "neutral"
  | "slight"
  | "open"
  | "smileOpen"
  | "happyClosed"
  | "surprised"
  | "blink";

export const faceTextureUrls: Record<FaceKey, string> = {
  neutral: "/faces/face_neutral.png",
  slight: "/faces/face_slight.png",
  open: "/faces/face_open.png",
  smileOpen: "/faces/face_smile_open.png",
  happyClosed: "/faces/face_happy_closed.png",
  surprised: "/faces/face_surprised.png",
  blink: "/faces/face_blink.png"
};

// 립싱크 사다리: 입이 벌어지는 크기 순서 (음량이 커질수록 뒤쪽 프레임)
// 일자 입 → 작은 O → 타원 → 활짝 D
const speakingFaceSequence: FaceKey[] = ["neutral", "surprised", "smileOpen", "open"];

export const speakingFaceCount = speakingFaceSequence.length;

// 기본 표정은 웃는 얼굴(open: D자형 스마일 입)
const stateFaceMap: Record<RobotState, FaceKey> = {
  idle: "open",
  listening: "open",
  thinking: "slight",
  speaking: "open"
};

export function faceForFrame(state: RobotState, lipFrame = 0, blinking = false): FaceKey {
  if (blinking) {
    return "blink";
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
