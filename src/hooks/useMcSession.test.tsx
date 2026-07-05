import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMcSession } from "./useMcSession";

class MockAudio {
  static instances: MockAudio[] = [];

  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(async () => {
    this.onended?.();
  });

  constructor(public src: string) {
    MockAudio.instances.push(this);
  }
}

describe("useMcSession speech preparation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockAudio.instances = [];
    vi.stubGlobal("Audio", MockAudio);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:prepared-speech");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("prepares TTS for the draft answer and reuses it when speaking", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(new Blob(["audio"], { type: "audio/wav" }), {
        status: 200,
        headers: {
          "Content-Type": "audio/wav",
          "X-AI-MC-TTS-Provider": "gemini"
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMcSession());

    act(() => {
      result.current.setDraftAnswer("안녕하세요, 곧 시작할게요.");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tts",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("안녕하세요, 곧 시작할게요.")
      })
    );

    act(() => {
      result.current.approveDraft();
    });

    await act(async () => {
      await result.current.speak();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(MockAudio.instances[0]?.src).toBe("blob:prepared-speech");
  });

  it("prepares multi-sentence TTS chunks in parallel", async () => {
    const pendingResponses: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          pendingResponses.push(resolve);
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMcSession());

    act(() => {
      result.current.setDraftAnswer("첫 문장입니다. 두 번째 문장입니다.");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const secondCall = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(String(firstCall[1].body)).text).toBe("첫 문장입니다.");
    expect(JSON.parse(String(secondCall[1].body)).text).toBe("두 번째 문장입니다.");

    await act(async () => {
      pendingResponses.forEach((resolve) => {
        resolve(
          new Response(new Blob(["audio"], { type: "audio/wav" }), {
            status: 200,
            headers: {
              "Content-Type": "audio/wav",
              "X-AI-MC-TTS-Provider": "gemini"
            }
          })
        );
      });
    });
  });
});
