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

function stageSentenceCuesForKorean(text: string, maxChars = 26): string[][] {
  const normalized = protectKoreanStagePhrases(plainMcCopy(text).replace(/\s+/g, " ").trim());
  if (!normalized) {
    return [];
  }

  const sentenceMatches = normalized.match(/[^.!?。！？]+[.!?。！？]?/g) || [normalized];
  return sentenceMatches
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .map((sentence) =>
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
  if (options.isSpeaking) {
    const cues = stageSentenceCuesForKorean(text, options.maxChars);
    const cueIndex = Math.max(0, Math.floor(options.cueIndex ?? 0));
    return cues[cueIndex] || [];
  }

  return stageLinesForKorean(text, options.maxChars);
}

export function captionCueCount(text: string): number {
  return stageSentenceCuesForKorean(text).length;
}

// 문장별 발화 종료 시각(초) 목록으로 현재 자막 큐를 찾는다 (타임스탬프 방식).
// currentTime이 times[k]를 지나기 전까지 k번째 문장을 보여준다.
export function captionCueIndexForTimes(times: number[], currentTime: number): number {
  if (times.length === 0) {
    return 0;
  }

  for (let index = 0; index < times.length; index++) {
    if (currentTime < times[index]) {
      return index;
    }
  }

  return times.length - 1;
}

// 오디오 재생 진행률(0~1)을 자막 큐 인덱스로 변환한다.
// 큐는 문장 단위이고 발화 시간은 글자 수에 대략 비례하므로,
// 문장 글자 수의 누적 비중으로 현재 문장을 찾는다.
export function captionCueIndexForProgress(text: string, progress: number): number {
  const cues = stageSentenceCuesForKorean(text);
  if (cues.length === 0) {
    return 0;
  }

  const lengths = cues.map((lines) => Math.max(1, lines.join(" ").length));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const clamped = Math.min(Math.max(progress, 0), 1);
  const target = clamped * total;

  let cumulative = 0;
  for (let index = 0; index < lengths.length; index++) {
    cumulative += lengths[index];
    if (target < cumulative) {
      return index;
    }
  }

  return cues.length - 1;
}

export function statusLabel(state: RobotState): string {
  return STATUS_LABELS[state];
}
