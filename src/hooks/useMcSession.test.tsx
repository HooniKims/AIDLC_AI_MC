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
          "X-AI-MC-TTS-Provider": "elevenlabs"
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
    expect(requestBody.requireProvider).toBeUndefined();
    expect(requestBody.elevenVoice).toBe("bQlkYuipD5BHEhntA5iz");

    await act(async () => {
      await result.current.speak();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(MockAudio.instances[0]?.src).toBe("blob:prepared-speech");
  });

  it("speaks the generated answer right away instead of the default greeting", async () => {
    const ttsBodies: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/generate-answer") {
        return new Response(JSON.stringify({ answer: "생성된 답변입니다." }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      ttsBodies.push(String(init?.body));
      return new Response(new Blob(["audio"], { type: "audio/wav" }), {
        status: 200,
        headers: {
          "Content-Type": "audio/wav",
          "X-AI-MC-TTS-Provider": "elevenlabs"
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMcSession());

    await act(async () => {
      await result.current.generateAnswer();
    });

    expect(result.current.approvedAnswer).toBe("생성된 답변입니다.");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    await act(async () => {
      await result.current.speak();
    });

    expect(ttsBodies.length).toBeGreaterThan(0);
    ttsBodies.forEach((body) => {
      expect(body).toContain("생성된 답변입니다.");
      expect(body).not.toContain("AI MC입니다");
    });
    expect(MockAudio.instances[0]?.src).toBe("blob:prepared-speech");
  });

  it("prepares a full answer in one request to keep the voice stable", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(new Blob(["audio"], { type: "audio/wav" }), {
        status: 200,
        headers: {
          "Content-Type": "audio/wav",
          "X-AI-MC-TTS-Provider": "elevenlabs"
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
    expect(JSON.parse(String(firstCall[1].body)).requireProvider).toBeUndefined();
  });

  it("does not play audio when the engine-required request fails", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () =>
        new Response(JSON.stringify({ error: "ElevenLabs 음성 생성에 실패했습니다. quota" }), {
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
    expect(result.current.error).toContain("ElevenLabs 음성 생성에 실패했습니다");
  });
});
