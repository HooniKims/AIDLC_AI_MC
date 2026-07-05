import type { RobotState } from "../types";

const STATUS_LABELS: Record<RobotState, string> = {
  idle: "대기 중",
  listening: "질문 확인 중",
  thinking: "답변 작성 중",
  speaking: "답변 중"
};

export function canGenerateAnswer(question: string): boolean {
  return question.trim().length > 0;
}

export function nextLipFrame(currentFrame: number, totalFrames: number): number {
  if (totalFrames <= 0) {
    return 0;
  }

  return (currentFrame + 1) % totalFrames;
}

export function plainMcCopy(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function statusLabel(state: RobotState): string {
  return STATUS_LABELS[state];
}
