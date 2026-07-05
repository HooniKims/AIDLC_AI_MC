import { describe, expect, it } from "vitest";
import {
  canGenerateAnswer,
  nextLipFrame,
  plainMcCopy,
  stageCaptionLinesForKorean,
  stageLinesForKorean,
  statusLabel
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

  it("shows only the current subtitle chunk while speaking", () => {
    const answer = "첫 번째 안내입니다. 두 번째 안내입니다. 세 번째 안내입니다.";

    expect(stageCaptionLinesForKorean(answer, { isSpeaking: true, cueIndex: 0, maxLines: 2 })).toEqual([
      "첫 번째 안내입니다.",
      "두 번째 안내입니다."
    ]);
    expect(stageCaptionLinesForKorean(answer, { isSpeaking: true, cueIndex: 1, maxLines: 2 })).toEqual([
      "세 번째 안내입니다."
    ]);
  });

  it("keeps the full caption available when the robot is not speaking", () => {
    const answer = "첫 번째 안내입니다. 두 번째 안내입니다. 세 번째 안내입니다.";

    expect(stageCaptionLinesForKorean(answer, { isSpeaking: false, cueIndex: 0, maxLines: 2 })).toEqual([
      "첫 번째 안내입니다.",
      "두 번째 안내입니다.",
      "세 번째 안내입니다."
    ]);
  });
});
