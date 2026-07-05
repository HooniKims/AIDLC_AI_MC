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

  it("prepares TTS after approval and reuses it when speaking", async () => {
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

    expect(fetchMock).not.toHaveBeenCalled();

    act(() => {
      result.current.approveDraft();
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
    const preparedCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const requestBody = JSON.parse(String(preparedCall[1].body));
    expect(requestBody.requireProvider).toBe("gemini");

    await act(async () => {
      await result.current.speak();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(MockAudio.instances[0]?.src).toBe("blob:prepared-speech");
  });

  it("prepares a full answer in one Gemini request to keep the voice stable", async () => {
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
      result.current.setDraftAnswer("첫 문장입니다. 두 번째 문장입니다.");
    });

    act(() => {
      result.current.approveDraft();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(firstCall[1].body)).text).toBe("첫 문장입니다. 두 번째 문장입니다.");
    expect(JSON.parse(String(firstCall[1].body)).requireProvider).toBe("gemini");
  });

  it("does not play audio when the Gemini-required request fails", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () =>
        new Response(JSON.stringify({ error: "Gemini 음성 생성에 실패했습니다. quota" }), {
          status: 502,
          headers: {
            "Content-Type": "application/json"
          }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMcSession());

    act(() => {
      result.current.setDraftAnswer("첫 문장입니다. 두 번째 문장입니다.");
    });

    act(() => {
      result.current.approveDraft();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.speak();
    });

    expect(MockAudio.instances).toHaveLength(0);
    expect(result.current.error).toContain("Gemini 음성 생성에 실패했습니다");
  });
});
