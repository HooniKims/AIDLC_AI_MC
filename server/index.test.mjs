import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createApp, plainMcCopy } from "./index.mjs";
import { createVercelApiHandler } from "./vercelHandler.mjs";

function createMockOpenAI() {
  return {
    responses: {
      create: vi.fn(async () => ({
        output_text:
          "- **코엑스 마곡 4층**에서 열리는 AI·디지털 러닝 콘페스타입니다."
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

function createMockGeminiFetch() {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({
      interaction: {
        output_audio: {
          data: Buffer.from([1, 2, 3, 4]).toString("base64")
        }
      }
    })
  }));
}

describe("AI MC API", () => {
  it("returns a clear 503 when the OpenAI API key is missing", async () => {
    const app = createApp({
      env: {
        OPENAI_API_KEY: "",
        OPENAI_MODEL: "gpt-5.4-mini",
        OPENAI_TTS_MODEL: "gpt-4o-mini-tts",
        OPENAI_TTS_VOICE: "shimmer"
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
    expect(response.body.answer).not.toContain("**");
    expect(response.body.answer).not.toContain("-");
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

  it("uses Gemini 3.1 Flash TTS as the primary speech engine", async () => {
    const fetchImpl = createMockGeminiFetch();
    const app = createApp({
      fetchImpl,
      env: {
        OPENAI_API_KEY: "",
        GEMINI_API_KEY: "gemini-test-key",
        GEMINI_TTS_MODEL: "gemini-3.1-flash-tts-preview",
        GEMINI_TTS_VOICE: "Leda"
      }
    });

    const response = await request(app)
      .post("/api/tts")
      .send({ text: "안녕하세요. AI MC입니다.", geminiVoice: "Puck" })
      .expect(200);

    expect(response.headers["content-type"]).toContain("audio/wav");
    expect(response.headers["x-ai-mc-tts-provider"]).toBe("gemini");
    expect(response.headers["x-ai-mc-tts-voice"]).toBe("Puck");
    expect(response.body.length).toBe(48);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-goog-api-key": "gemini-test-key"
        })
      })
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.model).toBe("gemini-3.1-flash-tts-preview");
    expect(body.generation_config.speech_config[0].voice).toBe("Puck");
    expect(body.input).toContain("어린 캐릭터");
    expect(body.input).toContain("[very fast]");
  });

  it("reads Gemini REST audio from interaction steps", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        steps: [
          {
            content: [
              {
                mime_type: "audio/l16",
                data: Buffer.from([5, 6, 7, 8]).toString("base64")
              }
            ]
          }
        ]
      })
    }));
    const app = createApp({
      fetchImpl,
      env: {
        OPENAI_API_KEY: "",
        GEMINI_API_KEY: "gemini-test-key",
        GEMINI_TTS_MODEL: "gemini-3.1-flash-tts-preview",
        GEMINI_TTS_VOICE: "Leda"
      }
    });

    const response = await request(app)
      .post("/api/tts")
      .send({ text: "안녕하세요. AI MC입니다.", geminiVoice: "Leda" })
      .expect(200);

    expect(response.headers["x-ai-mc-tts-provider"]).toBe("gemini");
    expect(response.body.length).toBe(48);
  });

  it("falls back to OpenAI speech when Gemini key is not configured", async () => {
    const openai = createMockOpenAI();
    const app = createApp({
      openai,
      env: {
        GEMINI_API_KEY: "",
        OPENAI_API_KEY: "test-key",
        OPENAI_TTS_MODEL: "gpt-4o-mini-tts",
        OPENAI_TTS_VOICE: "shimmer",
        OPENAI_TTS_SPEED: "1.18"
      }
    });

    const response = await request(app)
      .post("/api/tts")
      .send({ text: "안녕하세요. AI MC입니다." })
      .expect(200);

    expect(response.headers["content-type"]).toContain("audio/mpeg");
    expect(response.headers["x-ai-mc-tts-provider"]).toBe("openai");
    expect(response.headers["x-ai-mc-tts-voice"]).toBe("shimmer");
    expect(response.body.length).toBe(4);
    expect(openai.audio.speech.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini-tts",
        voice: "shimmer",
        input: "안녕하세요. AI MC입니다.",
        speed: 1.18
      })
    );
  });

  it("falls back to OpenAI speech when Gemini returns an error", async () => {
    const openai = createMockOpenAI();
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      json: async () => ({
        error: {
          message: "Gemini quota exceeded"
        }
      })
    }));
    const app = createApp({
      openai,
      fetchImpl,
      env: {
        GEMINI_API_KEY: "gemini-test-key",
        OPENAI_API_KEY: "test-key",
        OPENAI_TTS_MODEL: "gpt-4o-mini-tts",
        OPENAI_TTS_VOICE: "shimmer"
      }
    });

    const response = await request(app)
      .post("/api/tts")
      .send({ text: "안녕하세요. AI MC입니다." })
      .expect(200);

    expect(response.headers["x-ai-mc-tts-provider"]).toBe("openai");
    expect(response.headers["x-ai-mc-tts-fallback"]).toBe("gemini-error");
    expect(fetchImpl).toHaveBeenCalled();
    expect(openai.audio.speech.create).toHaveBeenCalled();
  });

  it("normalizes markdown copy before display or speech", () => {
    expect(plainMcCopy("1. **반가워요!**\n2. `AI MC`입니다.")).toBe("반가워요!\nAI MC입니다.");
  });

  it("creates the production SPA fallback without invalid Express routes", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-mc-server-"));
    const distDir = path.join(rootDir, "dist");
    fs.mkdirSync(distDir);
    fs.writeFileSync(path.join(distDir, "index.html"), "<main>AI MC fallback</main>");

    const app = createApp({ rootDir, serveClient: true });

    const response = await request(app).get("/demo").expect(200);
    expect(response.text).toContain("AI MC fallback");
  });

  it("routes Vercel /api function requests back to the Express API path", async () => {
    const handler = createVercelApiHandler("/api/generate-answer", {
      env: {
        OPENAI_API_KEY: ""
      }
    });

    const response = await request(handler).post("/").send({ question: "행사 장소가 어디인가요?" }).expect(503);
    expect(response.body.error).toContain("OPENAI_API_KEY");
  });
});
