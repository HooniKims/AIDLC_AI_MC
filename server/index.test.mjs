import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./index.mjs";

function createMockOpenAI() {
  return {
    responses: {
      create: vi.fn(async () => ({
        output_text:
          "코엑스 마곡 4층에서 열리는 AI·디지털 러닝 콘페스타입니다."
      }))
    },
    audio: {
      speech: {
        create: vi.fn(async () => ({
          arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer
        }))
      }
    }
  };
}

describe("AI MC API", () => {
  it("returns a clear 503 when the OpenAI API key is missing", async () => {
    const app = createApp({
      env: {
        OPENAI_API_KEY: "",
        OPENAI_MODEL: "gpt-5.4-mini",
        OPENAI_TTS_MODEL: "gpt-4o-mini-tts",
        OPENAI_TTS_VOICE: "coral"
      }
    });

    const response = await request(app)
      .post("/api/generate-answer")
      .send({ question: "행사 장소가 어디인가요?" })
      .expect(503);

    expect(response.body.error).toContain("OPENAI_API_KEY");
  });

  it("generates a Korean answer with the configured value model", async () => {
    const openai = createMockOpenAI();
    const app = createApp({
      openai,
      env: {
        OPENAI_API_KEY: "test-key",
        OPENAI_MODEL: "gpt-5.4-mini",
        OPENAI_REASONING_EFFORT: "low"
      }
    });

    const response = await request(app)
      .post("/api/generate-answer")
      .send({ question: "행사 장소가 어디인가요?" })
      .expect(200);

    expect(response.body.answer).toContain("코엑스 마곡");
    expect(openai.responses.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.4-mini",
        reasoning: { effort: "low" }
      })
    );
  });

  it("rejects empty questions before calling OpenAI", async () => {
    const openai = createMockOpenAI();
    const app = createApp({
      openai,
      env: {
        OPENAI_API_KEY: "test-key"
      }
    });

    await request(app).post("/api/generate-answer").send({ question: " " }).expect(400);
    expect(openai.responses.create).not.toHaveBeenCalled();
  });

  it("returns generated speech as mp3 audio", async () => {
    const openai = createMockOpenAI();
    const app = createApp({
      openai,
      env: {
        OPENAI_API_KEY: "test-key",
        OPENAI_TTS_MODEL: "gpt-4o-mini-tts",
        OPENAI_TTS_VOICE: "coral"
      }
    });

    const response = await request(app)
      .post("/api/tts")
      .send({ text: "안녕하세요. AI MC입니다." })
      .expect(200);

    expect(response.headers["content-type"]).toContain("audio/mpeg");
    expect(response.body.length).toBe(4);
    expect(openai.audio.speech.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini-tts",
        voice: "coral"
      })
    );
  });
});
