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

function splitLongKoreanSentence(sentence: string, maxChars: number): string[] {
  const words = sentence.split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const nextLine = line ? `${line} ${word}` : word;
    if (line && nextLine.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = nextLine;
    }
  }

  if (line) {
    lines.push(line);
  }

  return lines;
}

function protectKoreanStagePhrases(text: string): string {
  return text
    .replace(/AI MC/g, "AI\u00a0MC")
    .replace(/디지털 러닝/g, "디지털\u00a0러닝")
    .replace(/AI·디지털/g, "AI·디지털");
}

export function stageLinesForKorean(text: string, maxChars = 26): string[] {
  const normalized = protectKoreanStagePhrases(plainMcCopy(text).replace(/\s+/g, " ").trim());
  if (!normalized) {
    return [];
  }

  const sentenceMatches = normalized.match(/[^.!?。！？]+[.!?。！？]?/g) || [normalized];
  return sentenceMatches
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .flatMap((sentence) =>
      sentence.length > maxChars ? splitLongKoreanSentence(sentence, maxChars) : [sentence]
    );
}

interface StageCaptionOptions {
  isSpeaking?: boolean;
  cueIndex?: number;
  maxChars?: number;
  maxLines?: number;
}

export function stageCaptionLinesForKorean(text: string, options: StageCaptionOptions = {}): string[] {
  const lines = stageLinesForKorean(text, options.maxChars);
  if (!options.isSpeaking) {
    return lines;
  }

  const maxLines = Math.max(1, options.maxLines ?? 2);
  const chunks: string[][] = [];
  for (let index = 0; index < lines.length; index += maxLines) {
    chunks.push(lines.slice(index, index + maxLines));
  }

  if (!chunks.length) {
    return [];
  }

  const cueIndex = Math.max(0, Math.floor(options.cueIndex ?? 0));
  return chunks[Math.min(cueIndex, chunks.length - 1)];
}

export function statusLabel(state: RobotState): string {
  return STATUS_LABELS[state];
}
