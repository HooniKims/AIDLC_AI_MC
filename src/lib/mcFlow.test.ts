import { describe, expect, it } from "vitest";
import {
  canGenerateAnswer,
  nextLipFrame,
  plainMcCopy,
  stageCaptionLinesForKorean,
  stageLinesForKorean,
  statusLabel,
  captionCueCount,
  captionCueIndexForProgress,
  captionCueIndexForTimes,
  parseCaptionTimesHeader
} from "./mcFlow";

describe("mcFlow", () => {
  it("allows answer generation only for non-empty questions", () => {
    expect(canGenerateAnswer("행사 장소가 어디인가요?")).toBe(true);
    expect(canGenerateAnswer("   ")).toBe(false);
  });

  it("cycles lip frames while speaking", () => {
    expect(nextLipFrame(0, 6)).toBe(1);
    expect(nextLipFrame(5, 6)).toBe(0);
  });

  it("returns Korean status labels for the robot state", () => {
    expect(statusLabel("idle")).toBe("대기 중");
    expect(statusLabel("listening")).toBe("질문 확인 중");
    expect(statusLabel("thinking")).toBe("답변 작성 중");
    expect(statusLabel("speaking")).toBe("답변 중");
  });

  it("removes visible markdown markers from generated MC copy", () => {
    expect(plainMcCopy("## 안내\n- **행사는** [공식 사이트](https://adl-confesta.kr/)에서 확인해요.")).toBe(
      "안내\n행사는 공식 사이트에서 확인해요."
    );
  });

  it("formats Korean stage copy into sentence-friendly display lines", () => {
    expect(stageLinesForKorean("안녕하세요. 저는 AI MC입니다. 함께 시작해요!")).toEqual([
      "안녕하세요.",
      "저는 AI\u00a0MC입니다.",
      "함께 시작해요!"
    ]);
    expect(stageLinesForKorean("교사가 가장 먼저 둘러보면 좋은 프로그램은 무엇인가요?", 14)).toEqual([
      "교사가 가장 먼저 둘러보면",
      "좋은 프로그램은",
      "무엇인가요?"
    ]);
  });

  it("shows only the current sentence while speaking", () => {
    const answer = "첫 번째 안내입니다. 두 번째 안내입니다. 세 번째 안내입니다.";

    expect(stageCaptionLinesForKorean(answer, { isSpeaking: true, cueIndex: 0, maxLines: 2 })).toEqual([
      "첫 번째 안내입니다."
    ]);
    expect(stageCaptionLinesForKorean(answer, { isSpeaking: true, cueIndex: 1, maxLines: 2 })).toEqual([
      "두 번째 안내입니다."
    ]);
  });

  it("treats empty or bogus caption-times headers as absent", () => {
    // Gemini 응답에는 헤더가 없다 — 빈 문자열이 [0]으로 파싱되면 자막이 첫 문장에 갇힌다
    expect(parseCaptionTimesHeader(null)).toBeNull();
    expect(parseCaptionTimesHeader("")).toBeNull();
    expect(parseCaptionTimesHeader("  ")).toBeNull();
    expect(parseCaptionTimesHeader("0")).toBeNull();
    expect(parseCaptionTimesHeader("abc")).toBeNull();
    expect(parseCaptionTimesHeader("0.76,2.68,3.44")).toEqual([0.76, 2.68, 3.44]);
  });

  it("maps playback time to caption cues using sentence end timestamps", () => {
    const times = [1.2, 4.5, 7.0];
    expect(captionCueIndexForTimes(times, 0)).toBe(0);
    expect(captionCueIndexForTimes(times, 1.19)).toBe(0);
    expect(captionCueIndexForTimes(times, 1.2)).toBe(1);
    expect(captionCueIndexForTimes(times, 4.6)).toBe(2);
    // 마지막 문장은 오디오가 끝날 때까지 유지된다
    expect(captionCueIndexForTimes(times, 99)).toBe(2);
    expect(captionCueIndexForTimes([], 3)).toBe(0);
  });

  it("maps audio progress to caption cues weighted by sentence length", () => {
    // 짧은 감탄 문장("안녕하세요!")은 다음 문장과 묶여 하나의 큐가 된다
    const text = "안녕하세요! 정말 반가워요. 오늘 행사는 코엑스 마곡 르웨스트홀에서 열려요. 궁금한 건 뭐든지 물어봐 주세요!";
    expect(captionCueCount(text)).toBe(3);
    expect(captionCueIndexForProgress(text, 0)).toBe(0);
    expect(captionCueIndexForProgress(text, 0.5)).toBe(1);
    expect(captionCueIndexForProgress(text, 0.99)).toBe(2);
    // 범위 밖 값은 양끝으로 클램프
    expect(captionCueIndexForProgress(text, -1)).toBe(0);
    expect(captionCueIndexForProgress(text, 2)).toBe(2);
  });

  it("merges short exclamation sentences into neighbor cues", () => {
    // "띠링!" 같은 짧은 문장이 단독 자막으로 휙 지나가지 않는다
    const text = "장소는 코엑스 마곡이에요. 띠링! 프로그램도 안내해드릴게요.";
    const cues = [0, 1, 2].map((i) =>
      stageCaptionLinesForKorean(text, { isSpeaking: true, cueIndex: i }).join(" ")
    );
    expect(captionCueCount(text)).toBe(2);
    expect(cues[0]).toContain("코엑스 마곡");
    expect(cues[1]).toContain("띠링!");
    expect(cues[1]).toContain("프로그램도 안내해드릴게요.");
  });

  it("keeps the final sentence on screen when the cue overflows while speaking", () => {
    const answer = "첫 번째 안내입니다. 두 번째 안내입니다. 세 번째 안내입니다.";

    expect(stageCaptionLinesForKorean(answer, { isSpeaking: true, cueIndex: 3, maxLines: 2 })).toEqual(["세 번째 안내입니다."]);
    expect(stageCaptionLinesForKorean(answer, { isSpeaking: true, cueIndex: 99, maxLines: 2 })).toEqual(["세 번째 안내입니다."]);
  });
});
