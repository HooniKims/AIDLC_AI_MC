// 음성 파형에서 문장 경계를 찾아 자막 전환 시각을 만든다.
// Gemini처럼 타임스탬프를 주지 않는 TTS도, 문장 사이의 무음(쉼)을 감지해
// 실제 발화 기준으로 자막을 넘길 수 있다.

export interface SilenceGap {
  start: number;
  end: number;
}

interface SilenceOptions {
  windowMs?: number;
  minGapMs?: number;
  thresholdRatio?: number;
}

// RMS 엔벨로프 기준 무음 구간 목록(초). threshold는 최대 RMS 대비 비율.
export function detectSilenceGaps(
  samples: Float32Array,
  sampleRate: number,
  { windowMs = 10, minGapMs = 140, thresholdRatio = 0.045 }: SilenceOptions = {}
): SilenceGap[] {
  if (samples.length === 0 || sampleRate <= 0) {
    return [];
  }

  const windowSize = Math.max(1, Math.round((sampleRate * windowMs) / 1000));
  const windowCount = Math.ceil(samples.length / windowSize);
  const envelope = new Float32Array(windowCount);
  let peak = 0;

  for (let w = 0; w < windowCount; w++) {
    const start = w * windowSize;
    const end = Math.min(samples.length, start + windowSize);
    let sum = 0;
    for (let i = start; i < end; i++) {
      sum += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sum / Math.max(1, end - start));
    envelope[w] = rms;
    peak = Math.max(peak, rms);
  }

  if (peak === 0) {
    return [];
  }

  const threshold = peak * thresholdRatio;
  const minWindows = Math.max(1, Math.round(minGapMs / windowMs));
  const gaps: SilenceGap[] = [];
  let runStart = -1;

  for (let w = 0; w <= windowCount; w++) {
    const silent = w < windowCount && envelope[w] < threshold;
    if (silent && runStart < 0) {
      runStart = w;
    } else if (!silent && runStart >= 0) {
      if (w - runStart >= minWindows) {
        gaps.push({
          start: (runStart * windowSize) / sampleRate,
          end: (w * windowSize) / sampleRate
        });
      }
      runStart = -1;
    }
  }

  return gaps;
}

// 큐 경계 비율(사전 추정)을 가장 가까운 무음 구간에 스냅해 자막 전환 시각을 만든다.
// 반환값은 captionCueIndexForTimes가 기대하는 "큐별 종료 시각" (마지막 = 전체 길이).
export function captionTimesFromAudioSamples(
  samples: Float32Array,
  sampleRate: number,
  boundaryFractions: number[],
  durationSeconds?: number
): number[] | null {
  if (samples.length === 0 || sampleRate <= 0) {
    return null;
  }

  const duration = durationSeconds ?? samples.length / sampleRate;
  if (boundaryFractions.length === 0) {
    return [duration];
  }

  const gaps = detectSilenceGaps(samples, sampleRate);
  // 시작/끝의 여는 무음은 문장 경계가 아니다
  const interior = gaps.filter((gap) => gap.start > 0.2 && gap.end < duration - 0.2);
  const used = new Set<number>();
  // 경계당 허용 오차: 평균 큐 길이의 60% (너무 먼 무음에 스냅하지 않는다)
  const window = Math.max(0.6, (duration / (boundaryFractions.length + 1)) * 0.6);

  const times = boundaryFractions.map((fraction) => {
    const expected = fraction * duration;
    let bestIndex = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < interior.length; i++) {
      if (used.has(i)) {
        continue;
      }
      const gap = interior[i];
      const center = (gap.start + gap.end) / 2;
      const distance = Math.abs(center - expected);
      if (distance < bestDistance && distance <= window) {
        bestDistance = distance;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0) {
      used.add(bestIndex);
      // 무음이 끝나고 다음 문장이 시작되는 순간에 자막을 넘긴다
      return interior[bestIndex].end;
    }
    return expected;
  });

  // 시각이 역행하지 않게 정렬 보정 후 마지막 큐 종료(전체 길이) 추가
  for (let i = 1; i < times.length; i++) {
    times[i] = Math.max(times[i], times[i - 1] + 0.05);
  }
  return [...times, duration];
}
