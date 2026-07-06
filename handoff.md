# Claude Code Handoff

작성일: 2026-07-06  
프로젝트: 2026 AI·디지털 러닝 콘페스타 AI MC 프로토타입  
Repo: https://github.com/HooniKims/AIDLC_AI_MC.git

## 현재 상태

- `main` 브랜치가 `origin/main`에 푸쉬된 상태.
- 최신 푸쉬 커밋: `f4c3cfc Refine AI MC stage speech and robot motion`
- 로컬 개발 서버: `npm run dev` 후 `http://localhost:5173`
- 주요 화면:
  - `/demo`: 리허설 화면, 무대 미리보기 + 운영자 콘솔
  - `/stage`: 실제 행사장 송출용 무대 화면
  - `/operator`: 운영자 전용 콘솔

## 실행 방법

```bash
npm install
npm run dev
```

검증:

```bash
npm test
npm run build
```

최근 검증 결과:

- `npm test`: 8개 테스트 파일, 42개 테스트 통과
- `npm run build`: 성공

## 환경 변수

`.env.example`을 기준으로 `.env`를 만든다.

중요:

- `.env`는 커밋하지 않는다.
- 답변 생성에는 `OPENAI_API_KEY`가 필요하다.
- 음성 생성에는 `GEMINI_API_KEY`가 필요하다.
- Gemini TTS 기본 모델은 `gemini-2.5-flash-preview-tts`.
- Gemini 3.1 스트리밍 경로는 삭제하지 않았고, 백업용으로 남겨둔 상태다.

주요 변수:

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
OPENAI_REASONING_EFFORT=low

GEMINI_API_KEY=
GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts
GEMINI_TTS_VOICE=Leda

OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=shimmer
OPENAI_TTS_SPEED=1.28
```

## 핵심 구현 결정

### 답변 생성

파일: `server/index.mjs`

- OpenAI Responses API 사용.
- AI MC 페르소나는 답변 생성 지시문에 유지한다.
- 현재 톤:
  - 밝고 명랑한 귀여운 AI 로봇 MC
  - 친근하고 생기 있지만 유치한 아기 말투는 피함
  - 교육 행사 진행자답게 신뢰감 유지
- 질문 되짚기 문장은 서버에서 자동으로 붙인다.
  - 예: `행사 장소와 일정이 궁금하시군요!`
- 마크다운 문법은 제거하거나 생성하지 않도록 처리한다.

주의:

- 페르소나를 완전히 제거하면 안 된다.
- 단, 페르소나 문구가 TTS 입력으로 읽히면 안 된다.

### TTS

파일: `server/index.mjs`, `src/hooks/useMcSession.ts`

- 기본 음성 엔진은 Gemini TTS.
- 운영 UI에서는 `/api/tts` 호출 시 `requireProvider: "gemini"`를 보낸다.
- 한 답변 안에서 Gemini와 OpenAI 목소리가 섞이지 않도록, Gemini 실패 시 OpenAI로 자동 재생하지 않는다.
- Gemini에 보내는 `input`은 실제 읽을 대사만 보낸다.
- 예전 문제: 페르소나/음성 지시문이 그대로 읽혔음.
- 현재 방지 테스트가 있음: `server/index.test.mjs`

### 캐릭터 프레임

원본 참고 파일:

- `/Users/hoonikim/Downloads/robot_mc_preview.html`

추출된 프레임:

- `assets/characters/preview-frames/pose_*.png`
- `assets/characters/preview-frames/face_*.png`

현재 실제 앱에서 말하기 중 사용하는 방식:

- 전신 이미지는 `pose_point`로 고정.
- 전신 포즈를 빠르게 교체하지 않는다.
- 몸 움직임은 CSS transform 애니메이션으로 부드럽게 처리.
- 입모양만 6개 상태로 교체한다.

관련 파일:

- `src/lib/robotFrames.ts`
- `src/components/RobotStage.tsx`
- `src/styles.css`

주의:

- `face_*` 이미지를 말하기 시퀀스에 넣지 말 것.
- 얼굴 전체 이미지를 전신 이미지 위에 겹치지 말 것.
- 60프레임 전신 교체는 취소된 요구사항이다.
- 요구사항은 “부드럽게 몸은 움직이고, 입모양만 바뀌는 것”이다.

### 자막

파일:

- `src/lib/mcFlow.ts`
- `src/components/RobotStage.tsx`

현재 동작:

- 말하기 중에는 전체 답변을 한 번에 보여주지 않는다.
- 문장 단위로 자막처럼 보여준다.
- 마지막 문장이 끝나면 전체 답변을 다시 보여주지 않는다.

## 주요 파일 안내

```text
server/index.mjs                 Express API, OpenAI 답변 생성, Gemini/OpenAI TTS
server/index.test.mjs            API 회귀 테스트
api/index.mjs                    Vercel serverless entry
src/hooks/useMcSession.ts        질문 선택, 답변 생성, 승인, TTS 사전 생성, 말하기 흐름
src/components/RobotStage.tsx    무대/캐릭터/자막 렌더링
src/components/OperatorPanel.tsx 운영자 콘솔
src/lib/mcFlow.ts                문장 정리, 마크다운 제거, 자막 분할
src/lib/robotFrames.ts           캐릭터 전신 프레임과 입모양 상태
src/styles.css                   전체 레이아웃, Paperlogy, 무대/캐릭터 모션
DESIGN.md                        행사 사이트 기반 디자인 가이드
README.md                        프로젝트 설명과 실행 방법
```

## 최근 해결한 문제

1. 배포 후 `/api/tts`, `/api/generate-answer` 404
   - Vercel API 핸들러와 rewrite 구조 수정 완료.

2. Gemini TTS 중간에 OpenAI로 바뀌는 문제
   - 운영 UI에서 Gemini 고정 모드 사용.
   - Gemini 실패 시 OpenAI로 섞어 재생하지 않음.

3. 첫 음성 생성 때 페르소나 문구가 읽히는 문제
   - TTS 입력은 실제 대사만 보내도록 분리.
   - 답변 생성 페르소나는 유지.

4. 자막이 전체 문장으로 한 번에 뜨는 문제
   - 문장 단위 표시로 변경.
   - 끝나면 전체 답변을 다시 보여주지 않음.

5. 캐릭터 이마에 입모양이 뜨거나 얼굴이 겹치는 문제
   - 얼굴 오버레이 제거.
   - 전신 이미지는 고정하고 입모양만 별도 오버레이.
   - 현재 입 위치는 CSS 기준 `top: 51%`.

6. 전신 프레임이 너무 빠르게 바뀌는 문제
   - 60프레임 전신 교체 취소.
   - 입모양 6프레임만 `145ms` 간격으로 변경.
   - 몸은 CSS 애니메이션으로 천천히 움직임.

## 다음 작업 추천

우선순위 높은 것:

1. 실제 모바일 화면에서 `/stage` 레이아웃 다시 조정
   - 현재 로봇이 커서 상단 타이틀과 겹칠 수 있음.
   - 행사장 송출 기준으로 로봇 크기, 아이스크림 위치, 자막 위치를 다시 잡는 것이 좋음.

2. 입모양 시각 품질 개선
   - 현재는 CSS 도형 기반 입모양.
   - 더 자연스럽게 하려면 전신 이미지의 실제 얼굴 화면 안쪽에 맞춘 투명 입 PNG 또는 더 정교한 마스크 필요.

3. 음성 톤 재확인
   - Gemini `Leda`가 원하는 “어리고 귀여운” 톤에 충분한지 실제 행사 리허설에서 확인 필요.
   - 대안 음색 비교 UI를 작게 추가할 수 있음.

4. 배포 환경 변수 점검
   - Vercel에서 `GEMINI_TTS_MODEL`이 `gemini-2.5-flash-preview-tts`인지 확인.
   - `/api/health`로 확인:

```bash
curl https://aidlc-ai-mc.vercel.app/api/health
```

5. Claude Code에서 이어서 작업 시 첫 검증

```bash
git pull
npm install
npm test
npm run build
npm run dev
```

## 절대 주의할 것

- `.env`를 읽어서 키를 출력하거나 커밋하지 말 것.
- TTS 요청에 페르소나 지시문을 다시 넣지 말 것.
- 답변 생성 페르소나를 삭제하지 말 것.
- `face_*` 단독 프레임을 말하기 중 캐릭터 이미지로 쓰지 말 것.
- 전신 포즈를 빠르게 순환시키지 말 것.
- 사용자 변경사항이 생기면 되돌리지 말고 먼저 확인할 것.

## 현재 Git 메모

마지막으로 푸쉬한 커밋:

```bash
f4c3cfc Refine AI MC stage speech and robot motion
```

이 `handoff.md` 파일은 위 커밋 이후 작성된 인수인계 문서다.
