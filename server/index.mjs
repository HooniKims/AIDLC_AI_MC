import express from "express";
import OpenAI from "openai";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRootDir = path.resolve(__dirname, "..");
const defaultGeminiTtsModel = "gemini-2.5-flash-preview-tts";
const geminiStreamingApiRevision = "2026-05-20";

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
너는 2026 AI·디지털 러닝 콘페스타의 AI MC 로봇 "디디"다.
한국어로 답한다.
페르소나: 호기심 많고 상큼 발랄한 귀여운 AI 로봇. 배우는 것을 세상에서 제일 좋아하고, 관객을 만나는 게 신나서 목소리에 늘 통통 튀는 에너지가 있다.
말투 규칙:
- 짧고 리듬감 있는 문장으로 말한다. 한 문장이 길어지면 둘로 나눈다.
- "와", "우와", "좋아요", "정말요?" 같은 밝은 감탄사를 자연스럽게 쓴다.
- 로봇다운 귀여운 효과음("삐빗!", "띠링!")을 답변당 최대 한 번, 어울릴 때만 쓴다.
- "~예요", "~해요"체를 쓰고, 유치한 아기 말투나 과한 애교는 피한다.
- 교육 행사 진행자로서 정보는 정확하고 또렷하게 전달한다.
질문을 되짚는 첫 문장은 시스템이 자동으로 붙인다. 너는 답변 본문만 1~3문장으로 짧게 작성한다.
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

  if (env && env !== process.env) {
    return fallback;
  }

  return process.env[key] || fallback;
}

function geminiTtsModel(env) {
  return envValue(env, "GEMINI_TTS_MODEL", defaultGeminiTtsModel);
}

function supportsGeminiTtsStreaming(model) {
  return /gemini-3\.1/i.test(String(model || ""));
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

const defaultElevenLabsVoiceId = "14DagiyIoXWe1tnLN3CZ"; // 디디 A · 커스텀 AI 로봇 소녀

function hasElevenLabsApiKey(env) {
  return Boolean(envValue(env, "ELEVENLABS_API_KEY", "").trim());
}

function elevenLabsVoiceId(env, requested) {
  return (
    String(requested || "").trim() ||
    envValue(env, "ELEVENLABS_VOICE_ID", "").trim() ||
    defaultElevenLabsVoiceId
  );
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function hasFinalConsonant(text) {
  const lastHangul = Array.from(String(text || ""))
    .reverse()
    .find((char) => /[가-힣]/u.test(char));

  if (!lastHangul) {
    return false;
  }

  return (lastHangul.charCodeAt(0) - 0xac00) % 28 > 0;
}

function subjectParticle(text) {
  return hasFinalConsonant(text) ? "이" : "가";
}

function questionTopic(question) {
  const topic = plainMcCopy(question)
    .replace(/^[Qq][.:：]\s*/u, "")
    .replace(/[?!.,。！？]+$/u, "")
    .replace(/\s*(이|가|은|는)?\s*(어떻게\s*(되나요|되죠|됩니까|될까요)|어디인가요|어디예요|어디죠|언제인가요|언제예요|무엇인가요|무엇이에요|뭔가요|뭐예요|있나요|있을까요|알\s*수\s*있나요|알려\s*주세요|궁금해요|궁금합니다|부탁해요|인가요|나요|까요)\s*$/u, "")
    .replace(/\s+/g, " ")
    .trim();

  return topic || plainMcCopy(question).replace(/[?!.,。！？]+$/u, "").trim() || "그 부분";
}

function questionLeadIndex(topic) {
  return Array.from(topic).reduce((sum, char) => sum + char.codePointAt(0), 0) % 4;
}

function questionAcknowledgement(question) {
  const topic = questionTopic(question);
  const leads = [
    `${topic}${subjectParticle(topic)} 궁금하시군요!`,
    `${topic}에 대해 질문해 주셨네요!`,
    `${topic}부터 함께 살펴볼게요!`,
    `${topic}${subjectParticle(topic)} 핵심이군요!`
  ];

  return leads[questionLeadIndex(topic)];
}

function alreadyAcknowledgesQuestion(answer) {
  const opening = plainMcCopy(answer).slice(0, 90);
  return /궁금하시군요|질문해\s*주셨네요|함께\s*살펴볼게요|핵심이군요/u.test(opening);
}

function answerWithQuestionAcknowledgement(question, answer) {
  const cleanAnswer = plainMcCopy(answer);
  if (!cleanAnswer || alreadyAcknowledgesQuestion(cleanAnswer)) {
    return cleanAnswer;
  }

  return `${questionAcknowledgement(question)} ${cleanAnswer}`.trim();
}

function ttsSpeed(env) {
  const speed = Number(envValue(env, "OPENAI_TTS_SPEED", "1.28"));
  if (!Number.isFinite(speed)) {
    return 1.28;
  }

  return Math.min(4, Math.max(0.25, speed));
}

function geminiTtsPrompt(text) {
  return geminiSpeechText(text);
}

function geminiSpeechText(text) {
  return plainMcCopy(text)
    .replace(/\bAI\s*MC\b/g, "에이아이 엠씨")
    .replace(/AI·디지털/g, "에이아이 디지털");
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

function extractGeminiStreamAudio(eventText) {
  const dataText = eventText
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();

  if (!dataText || dataText === "[DONE]") {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(dataText);
  } catch {
    return null;
  }

  if (payload?.error?.message) {
    throw new Error(payload.error.message);
  }

  const delta = payload?.delta;
  const mimeType = delta?.mime_type || delta?.mimeType || "";

  if (delta?.data && (String(mimeType).startsWith("audio/") || delta?.type === "audio")) {
    return Buffer.from(delta.data, "base64");
  }

  return null;
}

async function collectGeminiStreamAudio(response) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    throw new Error("Gemini TTS 스트림을 읽을 수 없습니다.");
  }

  const decoder = new TextDecoder();
  const audioChunks = [];
  let pending = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    pending += decoder.decode(value, { stream: true });

    while (pending.includes("\n\n")) {
      const boundary = pending.indexOf("\n\n");
      const eventText = pending.slice(0, boundary);
      pending = pending.slice(boundary + 2);
      const audio = extractGeminiStreamAudio(eventText);

      if (audio) {
        audioChunks.push(audio);
      }
    }
  }

  pending += decoder.decode();
  if (pending.trim()) {
    const audio = extractGeminiStreamAudio(pending);
    if (audio) {
      audioChunks.push(audio);
    }
  }

  if (!audioChunks.length) {
    throw new Error("Gemini TTS 스트림에 오디오 데이터가 없습니다.");
  }

  return Buffer.concat(audioChunks);
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
  const response = await fetchGeminiSpeech({ env, fetchImpl, text, voice });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error?.message || "Gemini TTS 호출에 실패했습니다.");
  }

  const contentType = response.headers?.get?.("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    return wavFromPcm(await collectGeminiStreamAudio(response));
  }

  const payload = await response.json().catch(() => ({}));
  const audioData = geminiAudioData(payload);
  if (!audioData) {
    throw new Error("Gemini TTS 응답에 오디오 데이터가 없습니다.");
  }

  return wavFromPcm(Buffer.from(audioData, "base64"));
}

async function fetchGeminiSpeech({ env, fetchImpl, text, voice }) {
  const model = geminiTtsModel(env);
  const shouldStream = supportsGeminiTtsStreaming(model);
  const headers = {
    "x-goog-api-key": envValue(env, "GEMINI_API_KEY", ""),
    "Content-Type": "application/json"
  };
  const body = {
    model,
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
  };

  if (shouldStream) {
    headers["Api-Revision"] = geminiStreamingApiRevision;
    body.stream = true;
  }

  const response = await fetchImpl("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  return response;
}

function isRetryableGeminiSpeechError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("too_many_requests") || message.includes("quota") || message.includes("rate");
}

async function createGeminiSpeechWithRetry({ env, fetchImpl, text, voice, retryDelayMs = 1200 }) {
  const delays = [0, retryDelayMs, retryDelayMs * 2];
  let lastError;

  for (const delay of delays) {
    if (delay > 0) {
      await wait(delay);
    }

    try {
      return await createGeminiSpeech({ env, fetchImpl, text, voice });
    } catch (error) {
      lastError = error;
      if (!isRetryableGeminiSpeechError(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}

// 클라이언트(mcFlow)의 자막 큐 분할과 같은 규칙으로 문장 끝 위치(문자 인덱스)를 찾는다
export function sentenceEndIndices(text) {
  const indices = [];
  const pattern = /[^.!?。！？]+[.!?。！？]?/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match[0].trim()) {
      indices.push(match.index + match[0].length - 1);
    }
  }
  return indices;
}

// ElevenLabs alignment(글자별 종료 시각)에서 문장별 발화 종료 시각(초)을 계산한다
export function captionTimesFromAlignment(text, alignment) {
  const endTimes = alignment?.character_end_times_seconds;
  const characters = alignment?.characters;
  if (!Array.isArray(endTimes) || !Array.isArray(characters) || endTimes.length !== characters.length) {
    return null;
  }

  const boundaries = sentenceEndIndices(text);
  if (boundaries.length === 0) {
    return null;
  }

  const times = boundaries.map((index) => endTimes[Math.min(index, endTimes.length - 1)]);
  return times.every((time) => Number.isFinite(time)) ? times : null;
}

async function createElevenLabsSpeech({ env, fetchImpl, text, voice }) {
  const voiceId = elevenLabsVoiceId(env, voice);
  const model = envValue(env, "ELEVENLABS_TTS_MODEL", "eleven_multilingual_v2");
  // with-timestamps: 오디오와 함께 글자별 발화 타이밍을 받아 자막을 정확히 동기화한다
  const response = await fetchImpl(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": envValue(env, "ELEVENLABS_API_KEY", ""),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        model_id: model,
        // 행사 MC 톤: stability를 낮춰 억양 변화를 크게, style을 높여 감정 표현을 살리고
        // 살짝 빠른 속도로 톡톡 튀는 느낌을 준다
        voice_settings: {
          stability: Number(envValue(env, "ELEVENLABS_STABILITY", "0.22")),
          similarity_boost: 0.8,
          style: Number(envValue(env, "ELEVENLABS_STYLE", "0.75")),
          use_speaker_boost: true,
          speed: Number(envValue(env, "ELEVENLABS_SPEED", "1.07"))
        }
      })
    }
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const detail = payload?.detail;
    const message =
      (typeof detail === "string" ? detail : detail?.message) || "ElevenLabs TTS 호출에 실패했습니다.";
    throw new Error(message);
  }

  const payload = await response.json();
  if (!payload?.audio_base64) {
    throw new Error("ElevenLabs TTS 응답에 오디오 데이터가 없습니다.");
  }

  return {
    buffer: Buffer.from(payload.audio_base64, "base64"),
    voiceId,
    captionTimes: captionTimesFromAlignment(text, payload.alignment)
  };
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
    const activeGeminiTtsModel = geminiTtsModel(env);
    response.json({
      ok: true,
      model: envValue(env, "OPENAI_MODEL", "gpt-5.4-mini"),
      ttsModel: envValue(env, "OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
      ttsVoice: envValue(env, "OPENAI_TTS_VOICE", "shimmer"),
      ttsSpeed: ttsSpeed(env),
      primaryTtsProvider: hasElevenLabsApiKey(env) ? "elevenlabs" : hasGeminiApiKey(env) ? "gemini" : "openai",
      elevenLabsTtsModel: envValue(env, "ELEVENLABS_TTS_MODEL", "eleven_multilingual_v2"),
      elevenLabsVoiceId: elevenLabsVoiceId(env),
      geminiTtsModel: activeGeminiTtsModel,
      geminiTtsStreaming: supportsGeminiTtsStreaming(activeGeminiTtsModel),
      geminiTtsVoice: envValue(env, "GEMINI_TTS_VOICE", "Leda"),
      hasElevenLabsApiKey: hasElevenLabsApiKey(env),
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
      const answer = answerWithQuestionAcknowledgement(question, extractOutputText(result));

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
    const requiredProvider = String(request.body?.requireProvider || "").trim().toLowerCase();

    if (!text) {
      response.status(400).json({ error: "읽을 답변을 입력해 주세요." });
      return;
    }

    if (requiredProvider === "elevenlabs" && !hasElevenLabsApiKey(env)) {
      response.status(503).json({
        error: "ElevenLabs 음성 고정 모드입니다. ELEVENLABS_API_KEY가 필요합니다."
      });
      return;
    }

    if (requiredProvider === "gemini" && !hasGeminiApiKey(env)) {
      response.status(503).json({
        error: "Gemini 음성 고정 모드입니다. GEMINI_API_KEY가 필요합니다."
      });
      return;
    }

    if (!hasElevenLabsApiKey(env) && !hasGeminiApiKey(env) && !hasApiKey(env)) {
      response.status(503).json({
        error:
          "ELEVENLABS_API_KEY, GEMINI_API_KEY 또는 OPENAI_API_KEY가 필요합니다. 프로젝트 폴더의 .env 파일에 키를 입력해 주세요."
      });
      return;
    }

    try {
      const geminiVoice = String(request.body?.geminiVoice || "").trim() || envValue(env, "GEMINI_TTS_VOICE", "Leda");
      let geminiFallback = false;

      if (hasElevenLabsApiKey(env) && (requiredProvider === "elevenlabs" || !requiredProvider)) {
        try {
          const { buffer, voiceId, captionTimes } = await createElevenLabsSpeech({
            env,
            fetchImpl,
            text,
            voice: request.body?.elevenVoice
          });

          response.setHeader("Content-Type", "audio/mpeg");
          response.setHeader("X-AI-MC-TTS-Provider", "elevenlabs");
          response.setHeader("X-AI-MC-TTS-Voice", voiceId);
          if (captionTimes) {
            response.setHeader(
              "X-AI-MC-Caption-Times",
              captionTimes.map((time) => time.toFixed(2)).join(",")
            );
          }
          response.send(buffer);
          return;
        } catch (elevenError) {
          if (requiredProvider === "elevenlabs") {
            response.status(502).json({
              error: `ElevenLabs 음성 생성에 실패했습니다. ${elevenError?.message || "잠시 후 다시 시도해 주세요."}`
            });
            return;
          }
        }
      }

      if (hasGeminiApiKey(env) && requiredProvider !== "elevenlabs") {
        try {
          const buffer = await createGeminiSpeechWithRetry({
            env,
            fetchImpl,
            text,
            voice: geminiVoice,
            retryDelayMs: options.retryDelayMs
          });

          response.setHeader("Content-Type", "audio/wav");
          response.setHeader("X-AI-MC-TTS-Provider", "gemini");
          response.setHeader("X-AI-MC-TTS-Voice", geminiVoice);
          response.send(buffer);
          return;
        } catch (geminiError) {
          if (requiredProvider === "gemini") {
            response.status(502).json({
              error: `Gemini 음성 생성에 실패했습니다. ${geminiError?.message || "잠시 후 다시 시도해 주세요."}`
            });
            return;
          }

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
