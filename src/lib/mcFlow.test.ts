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
  captionCueIndexForTimes
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
    const text = "\uccab \ubb38\uc7a5. \ub450 \ubc88\uc9f8 \ubb38\uc7a5\uc740 \ud6e8\uc52c \ub354 \uae38\uc5b4\uc11c \uc624\ub798 \uc77d\ub294\ub2e4. \ub05d.";
    expect(captionCueCount(text)).toBe(3);
    expect(captionCueIndexForProgress(text, 0)).toBe(0);
    // \uc9e7\uc740 \uccab \ubb38\uc7a5\uc740 \uae08\ubc29 \uc9c0\ub098\uac00\uace0 \uae34 \ub450 \ubc88\uc9f8 \ubb38\uc7a5\uc774 \uc911\ubc18 \ub300\ubd80\ubd84\uc744 \ucc28\uc9c0\ud55c\ub2e4
    expect(captionCueIndexForProgress(text, 0.5)).toBe(1);
    expect(captionCueIndexForProgress(text, 0.99)).toBe(2);
    // \ubc94\uc704 \ubc16 \uac12\uc740 \uc591\ub05d\uc73c\ub85c \ud074\ub7a8\ud504
    expect(captionCueIndexForProgress(text, -1)).toBe(0);
    expect(captionCueIndexForProgress(text, 2)).toBe(2);
  });

  it("keeps the final sentence on screen when the cue overflows while speaking", () => {
    const answer = "첫 번째 안내입니다. 두 번째 안내입니다. 세 번째 안내입니다.";

    expect(stageCaptionLinesForKorean(answer, { isSpeaking: true, cueIndex: 3, maxLines: 2 })).toEqual(["세 번째 안내입니다."]);
    expect(stageCaptionLinesForKorean(answer, { isSpeaking: true, cueIndex: 99, maxLines: 2 })).toEqual(["세 번째 안내입니다."]);
  });
});
