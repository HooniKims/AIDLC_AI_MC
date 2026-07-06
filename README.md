# AI MC Confesta Prototype

2026 AI·디지털 러닝 콘페스타 현장에서 사용할 AI MC 프로토타입입니다. Tripo로 리깅된 3D 로봇 캐릭터가 초록 코드 글리치 연출과 함께 무대에 등장하고, 운영자가 질문을 선택하거나 입력하면 AI 답변을 만든 뒤 승인된 답변을 음성으로 말합니다. 말하는 동안 실제 음량을 분석해 입모양이 움직이고, 눈도 주기적으로 깜빡입니다.

공식 행사 디자인은 [https://adl-confesta.kr/](https://adl-confesta.kr/)을 참고했고, 현재 UI는 `DESIGN.md` 기준의 색상, 아이스크림 이미지, Paperlogy 폰트를 사용합니다.

## 주요 기능

- 리허설, 무대, 운영 화면을 분리합니다.
- 사전 입력 질문 큐와 운영자 직접 입력 질문을 지원합니다.
- OpenAI Responses API로 한국어 MC 답변을 생성하고, 생성 즉시 자동 승인되어 바로 말할 수 있습니다.
- ElevenLabs를 기본 음성 엔진으로 사용하며, 운영 콘솔에서 Gemini로 전환할 수 있습니다.
- 답변 생성 후 백그라운드에서 음성을 미리 생성해 재생 지연을 줄입니다.
- WebAudio 음량 분석 기반 립싱크: 일자 입 → 작은 O → 타원 → 활짝, 4단계 입모양이 음성 리듬을 따라갑니다.
- 3.4초 주기 눈 깜빡임 (말하는 중 포함).
- 페이지 로드 시 초록 코드 글리치 등장 연출 (클리핑 스윕 + 와이어프레임 + 스캔라인).
- Vercel 배포에서 `/demo`, `/stage`, `/operator`, `/api/*` 경로를 지원합니다.

## 화면 구성

| 경로 | 용도 |
| --- | --- |
| `/demo` | 내부 리허설용 화면입니다. 무대 미리보기와 운영 콘솔이 같이 보입니다. |
| `/stage` | 실제 행사장 송출용 화면입니다. 캐릭터와 자막 중심으로 보입니다. |
| `/operator` | 운영자용 화면입니다. 질문 선택, 답변 생성, 승인, 말하기를 제어합니다. |

## 3D 로봇 구조

- **모델**: 원본 GLB를 Tripo API로 자동 리깅하고 idle/walk/jump/turn 프리셋 애니메이션을 리타겟한 `public/models/robot-animated.glb`를 사용합니다. 파이프라인은 `scripts/tripo_rig.py`로 재실행할 수 있습니다 (`.env`의 `tripo_api_key` 필요).
- **동작**: 스켈레탈 애니메이션은 팔 체인에만 적용합니다. 머리·몸통의 생동감(기울임, 호흡, 말하기 바운스)은 그룹 레벨 모션으로 처리해 얼굴 스크린과 몸이 항상 함께 움직입니다. 다리는 고정되어 서 있는 자세를 유지합니다.
- **얼굴**: 스크린-얼굴 방식입니다. 머리 앞면의 텍스처 플레인에 표정 컷(`public/faces/`)을 갈아끼워 입모양과 깜빡임을 만듭니다. Tripo 리그는 본 월드좌표와 보이는 메시 위치가 어긋나므로 얼굴 플레인을 본에 attach하면 안 됩니다 (`Robot3D.tsx` 주석 참고).
- **폴백**: WebGL을 못 쓰는 송출 장비에서는 2D 포즈 이미지로 자동 전환됩니다.

## 음성 구조

기본 TTS 엔진은 **ElevenLabs** (`eleven_multilingual_v2`, 기본 음색 Jessica)입니다. 운영 콘솔의 음성 엔진 선택으로 **Gemini** (`gemini-2.5-flash-preview-tts`, 기본 음색 Leda)로 전환할 수 있습니다.

한 답변 안에서 목소리가 중간에 바뀌지 않도록 `/api/tts`에 `requireProvider`(elevenlabs 또는 gemini)를 보냅니다. 선택한 엔진의 음성 생성에 실패하면 다른 엔진을 섞어서 재생하지 않고 오류를 보여줍니다.

ElevenLabs 무료 티어는 기본 제공 보이스만 API로 쓸 수 있습니다. 유료 플랜으로 올리면 한국어 네이티브 보이스와 글자 단위 타임스탬프(정밀 립싱크·자막 싱크)를 쓸 수 있습니다. 비교용 음성 샘플은 `assets/tts-samples/`에 있습니다.

Gemini 3.1 스트리밍 경로는 백업으로 보존되어 있습니다. `GEMINI_TTS_MODEL=gemini-3.1-flash-tts-preview`로 바꾸면 다시 사용합니다.

## 음성 지연 단축 방식

1. 운영자가 질문을 선택하고 `AI 답변 생성`을 누릅니다.
2. 생성된 답변은 자동 승인되고, 브라우저가 백그라운드에서 TTS 오디오를 미리 생성합니다.
3. 답변을 수정한 경우 `승인`을 눌러 수정본을 반영합니다.
4. `로봇 말하기`를 누르면 준비된 오디오를 바로 재생합니다.
5. 아직 준비가 끝나지 않았으면 같은 요청을 기다렸다가 재생합니다.

답변 전체를 한 번에 TTS로 보내 목소리 톤이 문장마다 바뀌지 않게 했습니다.

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
| `ELEVENLABS_API_KEY` | 없음 | 기본 TTS 엔진(ElevenLabs)에 필요합니다. |
| `ELEVENLABS_VOICE_ID` | `cgSgspJ2msm6clMCkdW9` | 기본 음색(Jessica)입니다. |
| `ELEVENLABS_TTS_MODEL` | `eleven_multilingual_v2` | ElevenLabs TTS 모델입니다. |
| `GEMINI_API_KEY` | 없음 | Gemini TTS에 필요합니다. |
| `GEMINI_TTS_MODEL` | `gemini-2.5-flash-preview-tts` | Gemini TTS 모델입니다. |
| `GEMINI_TTS_VOICE` | `Leda` | 기본 Gemini 음색입니다. |
| `OPENAI_TTS_MODEL` | `gpt-4o-mini-tts` | 엔진 고정 모드가 아닐 때 사용할 수 있는 폴백 TTS 모델입니다. |
| `OPENAI_TTS_VOICE` | `shimmer` | OpenAI TTS 폴백 음색입니다. |
| `OPENAI_TTS_SPEED` | `1.28` | OpenAI TTS 폴백 속도입니다. |
| `tripo_api_key` | 없음 | 3D 리깅 파이프라인(`scripts/tripo_rig.py`) 재실행 시에만 필요합니다. |
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
| `POST /api/tts` | 승인된 답변을 음성 오디오로 변환합니다. `requireProvider`, `elevenVoice`, `geminiVoice`를 받습니다. |

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

Vercel 프로젝트 환경변수에 `.env.example`과 같은 키를 등록합니다 (`tripo_api_key`, `PORT` 제외 가능). `ELEVENLABS_API_KEY`가 없으면 기본 엔진 요청이 실패하므로 반드시 등록합니다.

배포 후 아래 경로로 확인합니다.

```bash
curl https://aidlc-ai-mc.vercel.app/api/health
```

## 프로젝트 구조

```text
api/                 Vercel Serverless Function 진입점
assets/              행사 이미지, 캐릭터 이미지, TTS 음색 샘플, Tripo 파이프라인 상태
public/fonts/        Paperlogy 웹폰트
public/faces/        로봇 스크린 얼굴 표정 컷 (입모양 사다리 + 깜빡임)
public/models/       Tripo 리깅 + 애니메이션 GLB
scripts/             Tripo 리깅 파이프라인 (tripo_rig.py)
server/              Express API와 Vercel API 핸들러
src/                 React UI, 운영 흐름, 3D 로봇 무대
DESIGN.md            행사 사이트 참고 디자인 가이드
vercel.json          SPA 라우팅 rewrite 설정
```

## 회의용 구현 메모

- 실제 운영에서는 리허설, 무대, 운영 화면을 분리해서 사용합니다.
- 운영자는 AI 답변을 그대로 읽히지 않고 승인 또는 수정 후 송출합니다.
- 음성 지연을 줄이기 위해 답변 생성 직후 TTS를 사전 생성합니다.
- 기본 음성은 ElevenLabs이고, Gemini는 콘솔에서 전환 가능한 예비 엔진입니다.
- 립싱크는 재생 오디오의 음량 분석 방식이라 어떤 TTS 엔진과도 동작합니다. ElevenLabs 유료 플랜 전환 시 타임스탬프 기반 정밀 립싱크로 업그레이드할 수 있습니다.
