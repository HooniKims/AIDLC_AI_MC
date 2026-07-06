import { describe, expect, it } from "vitest";
import { captionTimesFromAudioSamples, detectSilenceGaps } from "./captionAudioSync";
import { captionCueBoundaryFractions } from "./mcFlow";

const SAMPLE_RATE = 24000;

// 발화(사인파)와 무음을 이어붙인 합성 파형
function synth(segments: Array<{ seconds: number; silent: boolean }>): Float32Array {
  const total = segments.reduce((sum, seg) => sum + Math.round(seg.seconds * SAMPLE_RATE), 0);
  const samples = new Float32Array(total);
  let offset = 0;
  for (const seg of segments) {
    const length = Math.round(seg.seconds * SAMPLE_RATE);
    if (!seg.silent) {
      for (let i = 0; i < length; i++) {
        samples[offset + i] = Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE) * 0.5;
      }
    }
    offset += length;
  }
  return samples;
}

describe("captionAudioSync", () => {
  it("detects inter-sentence silence gaps", () => {
    const samples = synth([
      { seconds: 1.0, silent: false },
      { seconds: 0.3, silent: true },
      { seconds: 1.2, silent: false },
      { seconds: 0.25, silent: true },
      { seconds: 0.8, silent: false }
    ]);

    const gaps = detectSilenceGaps(samples, SAMPLE_RATE);
    expect(gaps.length).toBe(2);
    expect(gaps[0].start).toBeGreaterThan(0.9);
    expect(gaps[0].end).toBeLessThan(1.4);
    expect(gaps[1].start).toBeGreaterThan(2.4);
  });

  it("ignores gaps shorter than the minimum", () => {
    const samples = synth([
      { seconds: 1.0, silent: false },
      { seconds: 0.05, silent: true },
      { seconds: 1.0, silent: false }
    ]);

    expect(detectSilenceGaps(samples, SAMPLE_RATE).length).toBe(0);
  });

  it("snaps caption boundaries to silence gap ends", () => {
    // 3문장: 1.0초 / 1.2초 / 0.8초 발화, 사이 무음 0.3초·0.25초
    const samples = synth([
      { seconds: 1.0, silent: false },
      { seconds: 0.3, silent: true },
      { seconds: 1.2, silent: false },
      { seconds: 0.25, silent: true },
      { seconds: 0.8, silent: false }
    ]);
    const duration = samples.length / SAMPLE_RATE;

    // 글자 비율 추정이 다소 어긋나 있어도(0.4, 0.68) 무음 위치에 스냅된다
    const times = captionTimesFromAudioSamples(samples, SAMPLE_RATE, [0.4, 0.68], duration);
    expect(times).not.toBeNull();
    expect(times!.length).toBe(3);
    // 첫 경계: 첫 무음이 끝나는 1.3초 부근
    expect(times![0]).toBeGreaterThan(1.2);
    expect(times![0]).toBeLessThan(1.45);
    // 둘째 경계: 둘째 무음이 끝나는 2.75초 부근
    expect(times![1]).toBeGreaterThan(2.65);
    expect(times![1]).toBeLessThan(2.9);
    // 마지막은 전체 길이
    expect(times![2]).toBeCloseTo(duration, 2);
  });

  it("falls back to the estimate when no gap is nearby", () => {
    const samples = synth([{ seconds: 3.0, silent: false }]);
    const times = captionTimesFromAudioSamples(samples, SAMPLE_RATE, [0.5], 3.0);
    expect(times).toEqual([1.5, 3.0]);
  });

  it("returns per-cue boundary fractions from text", () => {
    const text = "첫 번째 안내입니다. 두 번째 안내입니다. 세 번째 안내입니다.";
    const fractions = captionCueBoundaryFractions(text);
    expect(fractions.length).toBe(2);
    expect(fractions[0]).toBeGreaterThan(0.2);
    expect(fractions[1]).toBeLessThan(1);
    expect(captionCueBoundaryFractions("한 문장뿐이에요.")).toEqual([]);
  });
});
