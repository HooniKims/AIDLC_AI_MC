# AI MC Confesta Prototype

2026 AI·디지털 러닝 콘페스타 현장에서 사용할 AI MC 프로토타입입니다. 3D 느낌의 귀여운 AI 로봇 캐릭터가 화면에 등장하고, 운영자가 질문을 선택하거나 입력하면 AI 답변을 만든 뒤 승인된 답변을 음성으로 말합니다.

공식 행사 디자인은 [https://adl-confesta.kr/](https://adl-confesta.kr/)을 참고했고, 현재 UI는 `DESIGN.md` 기준의 색상, 아이스크림 이미지, Paperlogy 폰트를 사용합니다.

## 주요 기능

- 리허설, 무대, 운영 화면을 분리합니다.
- 사전 입력 질문 큐와 운영자 직접 입력 질문을 지원합니다.
- OpenAI Responses API로 한국어 MC 답변을 생성합니다.
- 관객 질문을 먼저 자연스럽게 되짚고 답변을 이어갑니다.
- Gemini TTS를 메인 음성 엔진으로 사용합니다.
- 답변 승인 후 백그라운드에서 음성을 미리 생성합니다.
- 말하기 중 캐릭터 포즈, 입 모양, 자막이 함께 움직입니다.
- Vercel 배포에서 `/demo`, `/stage`, `/operator`, `/api/*` 경로를 지원합니다.

## 화면 구성

| 경로 | 용도 |
| --- | --- |
| `/demo` | 내부 리허설용 화면입니다. 무대 미리보기와 운영 콘솔이 같이 보입니다. |
| `/stage` | 실제 행사장 송출용 화면입니다. 캐릭터와 자막 중심으로 보입니다. |
| `/operator` | 운영자용 화면입니다. 질문 선택, 답변 생성, 승인, 말하기를 제어합니다. |

## 음성 구조

기본 TTS 모델은 `gemini-2.5-flash-preview-tts`입니다. 음색은 기본값으로 `Leda`를 사용합니다.

현재 운영 UI는 한 답변 안에서 목소리가 중간에 바뀌지 않도록 `/api/tts`에 `requireProvider: "gemini"`를 보냅니다. 그래서 Gemini 음성 생성에 실패하면 OpenAI로 섞어서 재생하지 않고 오류를 보여줍니다.

3.1 스트리밍 경로는 삭제하지 않았습니다. `.env` 또는 Vercel 환경변수에서 아래처럼 바꾸면 3.1 스트리밍 백업 경로를 다시 사용할 수 있습니다.

```env
GEMINI_TTS_MODEL=gemini-3.1-flash-tts-preview
```

## 음성 지연 단축 방식

1. 운영자가 질문을 선택하고 `AI 답변 생성`을 누릅니다.
2. 답변 초안을 확인하고 필요한 경우 수정합니다.
3. `승인`을 누르면 브라우저가 백그라운드에서 Gemini TTS 오디오를 미리 생성합니다.
4. `로봇 말하기`를 누르면 준비된 오디오를 바로 재생합니다.
5. 아직 준비가 끝나지 않았으면 같은 요청을 기다렸다가 재생합니다.

프로토타입에서는 답변 전체를 한 번에 TTS로 보내 목소리 톤이 문장마다 바뀌지 않게 했습니다.

## 설치

```bash
npm install
```

## 환경변수

`.env.example`을 복사해서 `.env`를 만들고 값을 입력합니다.

```bash
cp .env.example .env
```

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 없음 | 답변 생성에 필요합니다. |
| `OPENAI_MODEL` | `gpt-5.4-mini` | 답변 생성 모델입니다. |
| `OPENAI_REASONING_EFFORT` | `low` | 빠른 답변 생성을 위한 reasoning 설정입니다. |
| `GEMINI_API_KEY` | 없음 | Gemini TTS에 필요합니다. |
| `GEMINI_TTS_MODEL` | `gemini-2.5-flash-preview-tts` | 메인 TTS 모델입니다. |
| `GEMINI_TTS_VOICE` | `Leda` | 기본 Gemini 음색입니다. |
| `OPENAI_TTS_MODEL` | `gpt-4o-mini-tts` | 서버 API에서 Gemini 고정 모드가 아닐 때 사용할 수 있는 폴백 TTS 모델입니다. |
| `OPENAI_TTS_VOICE` | `shimmer` | OpenAI TTS 폴백 음색입니다. |
| `OPENAI_TTS_SPEED` | `1.28` | OpenAI TTS 폴백 속도입니다. |
| `PORT` | `5173` | 로컬 서버 포트입니다. |

## 로컬 실행

```bash
npm run dev
```

브라우저에서 아래 주소를 엽니다.

- [http://localhost:5173/demo](http://localhost:5173/demo)
- [http://localhost:5173/stage](http://localhost:5173/stage)
- [http://localhost:5173/operator](http://localhost:5173/operator)

## API

| 엔드포인트 | 설명 |
| --- | --- |
| `GET /api/health` | 현재 모델, TTS 설정, API 키 존재 여부를 확인합니다. |
| `POST /api/generate-answer` | 질문을 받아 행사 MC 답변을 생성합니다. |
| `POST /api/tts` | 승인된 답변을 음성 오디오로 변환합니다. |

예시:

```bash
curl http://localhost:5173/api/health
```

```bash
curl -X POST http://localhost:5173/api/generate-answer \
  -H "Content-Type: application/json" \
  -d '{"question":"행사 장소와 일정이 어떻게 되나요?"}'
```

## 테스트와 빌드

```bash
npm test
npm run build
```

## Vercel 배포

Vercel 프로젝트 환경변수에 `.env.example`과 같은 키를 등록합니다. 특히 `GEMINI_TTS_MODEL`이 예전 값인 `gemini-3.1-flash-tts-preview`로 남아 있으면 배포 환경은 계속 3.1을 사용합니다.

배포 후 아래 경로로 확인합니다.

```bash
curl https://aidlc-ai-mc.vercel.app/api/health
```

응답에서 다음 값을 확인합니다.

- `geminiTtsModel`: `gemini-2.5-flash-preview-tts`
- `geminiTtsStreaming`: `false`
- `primaryTtsProvider`: `gemini`

## 프로젝트 구조

```text
api/                 Vercel Serverless Function 진입점
assets/              행사 이미지와 AI MC 캐릭터 이미지
public/fonts/        Paperlogy 웹폰트
server/              Express API와 Vercel API 핸들러
src/                 React UI, 운영 흐름, 캐릭터 무대
DESIGN.md            행사 사이트 참고 디자인 가이드
vercel.json          SPA 라우팅 rewrite 설정
```

## 회의용 구현 메모

- 실제 운영에서는 리허설, 무대, 운영 화면을 분리해서 사용합니다.
- 운영자는 AI 답변을 그대로 읽히지 않고 승인 또는 수정 후 송출합니다.
- 음성 지연을 줄이기 위해 승인 직후 TTS를 사전 생성합니다.
- 프로토타입은 Gemini 2.5 TTS를 기본으로 사용하고, 3.1 스트리밍은 백업 경로로 보존합니다.
- 캐릭터 시트 기반 포즈와 입 모양 이미지를 사용하며, 추후 더 자연스러운 몸짓과 음성 싱크를 개선할 수 있습니다.
