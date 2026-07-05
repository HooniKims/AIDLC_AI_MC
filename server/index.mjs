import express from "express";
import OpenAI from "openai";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRootDir = path.resolve(__dirname, "..");

dotenv.config();

const eventBrief = `
행사명: 2026 AI·디지털 러닝 콘페스타
일정: 2026년 7월 24일(금)부터 7월 25일(토)
장소: 코엑스 마곡 르웨스트홀 및 회의실 4F
대상: 교원, 교육전문직, 학부모, 예비교원, 일반 시민
주요 프로그램: 비전특강 및 선포식, 컨퍼런스, 수업나눔, 선도교사 네트워킹과 공유회, 학부모 특강, 누구나 개발자 해커톤
공식 사이트: https://adl-confesta.kr/
`.trim();

const mcInstructions = `
너는 2026 AI·디지털 러닝 콘페스타의 AI MC다.
한국어로 답한다.
귀엽지만 유치하지 않고, 교육 행사 진행자답게 차분하고 신뢰감 있게 말한다.
답변은 2~4문장으로 짧게 한다.
마크다운 문법, 불릿, 번호 목록, 굵게 표시 기호를 쓰지 말고 자연스러운 진행자 대사문으로만 답한다.
행사와 AI·디지털 학습 관련 질문, 가벼운 캐릭터 대화에는 답한다.
정치, 혐오, 개인정보, 의료/법률 조언, 확인되지 않은 운영 정보는 정중히 피한다.
공식 사이트에서 확인된 내용과 일반적인 교육 관점만 사용한다.

${eventBrief}
`.trim();

function envValue(env, key, fallback) {
  if (env && Object.prototype.hasOwnProperty.call(env, key)) {
    return env[key] ?? fallback;
  }

  return process.env[key] || fallback;
}

function refreshRuntimeEnv(env, rootDir) {
  if (env === process.env) {
    dotenv.config({
      path: path.join(rootDir, ".env"),
      override: true
    });
  }
}

function hasApiKey(env) {
  return Boolean(envValue(env, "OPENAI_API_KEY", "").trim());
}

function hasGeminiApiKey(env) {
  return Boolean(envValue(env, "GEMINI_API_KEY", "").trim());
}

export function plainMcCopy(text) {
  return String(text || "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ttsSpeed(env) {
  const speed = Number(envValue(env, "OPENAI_TTS_SPEED", "1.28"));
  if (!Number.isFinite(speed)) {
    return 1.28;
  }

  return Math.min(4, Math.max(0.25, speed));
}

function geminiTtsPrompt(text) {
  return [
    "[excited] [curious] [very fast]",
    "한국어로 말해 주세요.",
    "어린 캐릭터 AI 로봇 진행자처럼, 맑고 높은 톤과 짧은 호흡으로 말해 주세요.",
    "말투는 귀엽고 발랄하지만 실제 행사 진행자답게 발음은 또렷해야 합니다.",
    "낮고 진지한 아나운서 톤, 과장된 성인 내레이션 톤은 피하세요.",
    "",
    text
  ].join("\n");
}

function geminiAudioData(payload) {
  const stepAudio = payload?.steps
    ?.flatMap((step) => step?.content || step?.contents || [])
    ?.find((part) => {
      const mimeType = part?.mime_type || part?.mimeType || "";
      return part?.data && String(mimeType).startsWith("audio/");
    })?.data;

  return (
    payload?.interaction?.output_audio?.data ||
    payload?.interaction?.outputAudio?.data ||
    payload?.output_audio?.data ||
    payload?.outputAudio?.data ||
    stepAudio
  );
}

function wavFromPcm(pcm, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

async function createGeminiSpeech({ env, fetchImpl, text, voice }) {
  const response = await fetchImpl("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "x-goog-api-key": envValue(env, "GEMINI_API_KEY", ""),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: envValue(env, "GEMINI_TTS_MODEL", "gemini-3.1-flash-tts-preview"),
      input: geminiTtsPrompt(text),
      response_format: {
        type: "audio"
      },
      generation_config: {
        speech_config: [
          {
            voice: voice || envValue(env, "GEMINI_TTS_VOICE", "Leda")
          }
        ]
      }
    })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error?.message || "Gemini TTS 호출에 실패했습니다.");
  }

  const audioData = geminiAudioData(payload);
  if (!audioData) {
    throw new Error("Gemini TTS 응답에 오디오 데이터가 없습니다.");
  }

  return wavFromPcm(Buffer.from(audioData, "base64"));
}

function getOpenAIClient(openai, env) {
  if (openai) {
    return openai;
  }

  return new OpenAI({
    apiKey: envValue(env, "OPENAI_API_KEY", "")
  });
}

function extractOutputText(response) {
  if (typeof response?.output_text === "string") {
    return response.output_text.trim();
  }

  const text = response?.output
    ?.flatMap((item) => item.content || [])
    ?.filter((content) => content.type === "output_text" && content.text)
    ?.map((content) => content.text)
    ?.join("\n")
    ?.trim();

  return text || "";
}

export function createApp(options = {}) {
  const app = express();
  const env = options.env || process.env;
  const rootDir = options.rootDir || defaultRootDir;
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => {
    refreshRuntimeEnv(env, rootDir);
    response.json({
      ok: true,
      model: envValue(env, "OPENAI_MODEL", "gpt-5.4-mini"),
      ttsModel: envValue(env, "OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
      ttsVoice: envValue(env, "OPENAI_TTS_VOICE", "shimmer"),
      ttsSpeed: ttsSpeed(env),
      primaryTtsProvider: hasGeminiApiKey(env) ? "gemini" : "openai",
      geminiTtsModel: envValue(env, "GEMINI_TTS_MODEL", "gemini-3.1-flash-tts-preview"),
      geminiTtsVoice: envValue(env, "GEMINI_TTS_VOICE", "Leda"),
      hasGeminiApiKey: hasGeminiApiKey(env),
      hasApiKey: hasApiKey(env)
    });
  });

  app.post("/api/generate-answer", async (request, response) => {
    refreshRuntimeEnv(env, rootDir);
    const question = String(request.body?.question || "").trim();

    if (!question) {
      response.status(400).json({ error: "질문을 입력해 주세요." });
      return;
    }

    if (!hasApiKey(env)) {
      response.status(503).json({
        error: "OPENAI_API_KEY가 없습니다. 프로젝트 폴더의 .env 파일에 키를 입력해 주세요."
      });
      return;
    }

    try {
      const client = getOpenAIClient(options.openai, env);
      const model = envValue(env, "OPENAI_MODEL", "gpt-5.4-mini");
      const reasoningEffort = envValue(env, "OPENAI_REASONING_EFFORT", "low");
      const result = await client.responses.create({
        model,
        reasoning: { effort: reasoningEffort },
        instructions: mcInstructions,
        input: `관객 질문: ${question}`
      });
      const answer = plainMcCopy(extractOutputText(result));

      response.json({
        answer: answer || "답변을 생성하지 못했습니다. 질문을 조금 다르게 입력해 주세요.",
        model
      });
    } catch (error) {
      response.status(500).json({
        error: error?.message || "AI 답변 생성 중 오류가 발생했습니다."
      });
    }
  });

  app.post("/api/tts", async (request, response) => {
    refreshRuntimeEnv(env, rootDir);
    const text = plainMcCopy(request.body?.text || "");

    if (!text) {
      response.status(400).json({ error: "읽을 답변을 입력해 주세요." });
      return;
    }

    if (!hasGeminiApiKey(env) && !hasApiKey(env)) {
      response.status(503).json({
        error: "GEMINI_API_KEY 또는 OPENAI_API_KEY가 필요합니다. 프로젝트 폴더의 .env 파일에 키를 입력해 주세요."
      });
      return;
    }

    try {
      const geminiVoice = String(request.body?.geminiVoice || "").trim() || envValue(env, "GEMINI_TTS_VOICE", "Leda");
      let geminiFallback = false;

      if (hasGeminiApiKey(env)) {
        try {
          const buffer = await createGeminiSpeech({
            env,
            fetchImpl,
            text,
            voice: geminiVoice
          });

          response.setHeader("Content-Type", "audio/wav");
          response.setHeader("X-AI-MC-TTS-Provider", "gemini");
          response.setHeader("X-AI-MC-TTS-Voice", geminiVoice);
          response.send(buffer);
          return;
        } catch (geminiError) {
          if (!hasApiKey(env)) {
            throw geminiError;
          }
          geminiFallback = true;
        }
      }

      if (!hasApiKey(env)) {
        response.status(503).json({
          error: "GEMINI_API_KEY 또는 OPENAI_API_KEY가 필요합니다. 프로젝트 폴더의 .env 파일에 키를 입력해 주세요."
        });
        return;
      }

      const client = getOpenAIClient(options.openai, env);
      const openaiVoice = envValue(env, "OPENAI_TTS_VOICE", "shimmer");
      const audio = await client.audio.speech.create({
        model: envValue(env, "OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
        voice: openaiVoice,
        input: text,
        instructions:
          "한국어로 말해 주세요. 어린 캐릭터 AI 로봇 진행자처럼 밝고 높은 톤, 짧은 호흡, 빠른 템포로 말하되 발음은 또렷하게 유지해 주세요. 낮고 진지한 아나운서 톤은 피하고, 귀엽고 사랑스럽지만 행사 진행자로서 과장되지 않게 말해 주세요.",
        speed: ttsSpeed(env)
      });
      const buffer = Buffer.from(await audio.arrayBuffer());

      response.setHeader("Content-Type", "audio/mpeg");
      response.setHeader("X-AI-MC-TTS-Provider", "openai");
      response.setHeader("X-AI-MC-TTS-Voice", openaiVoice);
      if (geminiFallback) {
        response.setHeader("X-AI-MC-TTS-Fallback", "gemini-error");
      }
      response.send(buffer);
    } catch (error) {
      response.status(500).json({
        error: error?.message || "음성 생성 중 오류가 발생했습니다."
      });
    }
  });

  if (options.serveClient) {
    const distDir = path.join(rootDir, "dist");
    app.use(express.static(distDir));
    app.get(/.*/, (_request, response) => {
      response.sendFile(path.join(distDir, "index.html"));
    });
  }

  return app;
}

async function startServer() {
  const rootDir = defaultRootDir;
  const app = createApp({ rootDir });
  const port = Number(process.env.PORT || 5173);

  if (process.env.NODE_ENV === "production") {
    const distDir = path.join(rootDir, "dist");
    app.use(express.static(distDir));
    app.get(/.*/, (_request, response) => {
      response.sendFile(path.join(distDir, "index.html"));
    });
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      root: rootDir,
      server: { middlewareMode: true },
      appType: "spa"
    });

    app.use(vite.middlewares);
    app.use(async (request, response, next) => {
      try {
        const template = fs.readFileSync(path.join(rootDir, "index.html"), "utf-8");
        const html = await vite.transformIndexHtml(request.originalUrl, template);
        response.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (error) {
        vite.ssrFixStacktrace(error);
        next(error);
      }
    });
  }

  app.listen(port, () => {
    console.log(`AI MC prototype running at http://localhost:${port}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}
