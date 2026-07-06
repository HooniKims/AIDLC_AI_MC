import { describe, expect, it } from "vitest";
import { containsProfanity, validateQuestion } from "./questionModeration";

describe("questionModeration", () => {
  it("accepts a well-formed question", () => {
    const result = validateQuestion({
      text: "AI를 수업에 어떻게 활용하면 좋을까요?",
      nickname: "김교사",
      affiliation: "교원"
    });
    expect(result.ok).toBe(true);
    expect(result.cleaned?.affiliation).toBe("교원");
  });

  it("collapses whitespace in cleaned output", () => {
    const result = validateQuestion({
      text: "질문   여러  칸   띄어쓰기",
      nickname: "  닉네임 ",
      affiliation: "학생"
    });
    expect(result.cleaned?.text).toBe("질문 여러 칸 띄어쓰기");
    expect(result.cleaned?.nickname).toBe("닉네임");
  });

  it("rejects empty and too-short questions", () => {
    expect(validateQuestion({ text: "", nickname: "a", affiliation: "일반" }).ok).toBe(false);
    expect(validateQuestion({ text: "짧음", nickname: "a", affiliation: "일반" }).ok).toBe(false);
  });

  it("rejects over-length questions", () => {
    const long = "가".repeat(201);
    expect(validateQuestion({ text: long, nickname: "a", affiliation: "일반" }).ok).toBe(false);
  });

  it("rejects invalid affiliation", () => {
    const result = validateQuestion({ text: "정상적인 질문입니다", nickname: "a", affiliation: "외계인" });
    expect(result.ok).toBe(false);
  });

  it("rejects missing nickname", () => {
    expect(validateQuestion({ text: "정상적인 질문입니다", nickname: "  ", affiliation: "일반" }).ok).toBe(false);
  });

  it("detects profanity in text and nickname", () => {
    expect(containsProfanity("이런 씨발 뭐야")).toBe(true);
    expect(containsProfanity("this is shit")).toBe(true);
    expect(containsProfanity("정상적인 질문입니다")).toBe(false);
    expect(validateQuestion({ text: "병신 같은 질문입니다", nickname: "관객", affiliation: "일반" }).ok).toBe(false);
  });

  it("does not over-block ordinary words", () => {
    expect(containsProfanity("시각 자료를 활용한 수업")).toBe(false);
    expect(containsProfanity("발표 자료 준비")).toBe(false);
  });
});
