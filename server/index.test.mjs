import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createApp, plainMcCopy } from "./index.mjs";

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

  it("returns generated speech as mp3 audio", async () => {
    const openai = createMockOpenAI();
    const app = createApp({
      openai,
      env: {
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
});
