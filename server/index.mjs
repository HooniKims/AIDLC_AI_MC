import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRootDir = path.resolve(__dirname, "..");

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

function hasApiKey(env) {
  return Boolean(envValue(env, "OPENAI_API_KEY", "").trim());
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

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({
      ok: true,
      model: envValue(env, "OPENAI_MODEL", "gpt-5.4-mini"),
      ttsModel: envValue(env, "OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
      hasApiKey: hasApiKey(env)
    });
  });

  app.post("/api/generate-answer", async (request, response) => {
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
      const answer = extractOutputText(result);

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
    const text = String(request.body?.text || "").trim();

    if (!text) {
      response.status(400).json({ error: "읽을 답변을 입력해 주세요." });
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
      const audio = await client.audio.speech.create({
        model: envValue(env, "OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
        voice: envValue(env, "OPENAI_TTS_VOICE", "coral"),
        input: text,
        instructions: "밝고 차분한 한국어 행사 진행자처럼 말해 주세요."
      });
      const buffer = Buffer.from(await audio.arrayBuffer());

      response.setHeader("Content-Type", "audio/mpeg");
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
