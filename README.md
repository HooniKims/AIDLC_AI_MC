# AI MC · 실시간 참여형 콘페스타 진행 시스템

2026 AI·디지털 러닝 콘페스타 현장에서 쓰는 **실시간 참여형 AI MC**입니다. 참가자가 QR로 질문을 보내면 운영자가 선별·승인하고, AI가 답변을 만들어 무대의 3D 로봇 캐릭터가 음성으로 말합니다. 말하는 동안 실제 음량을 분석해 입모양이 움직이고, 눈도 주기적으로 깜빡이며, 자막은 발화 리듬에 맞춰 올라옵니다.

공식 행사 디자인은 [https://adl-confesta.kr/](https://adl-confesta.kr/)을 참고했고, UI는 `DESIGN.md` 기준의 색상·아이스크림 이미지·Paperlogy 폰트를 사용합니다.

## 전체 흐름

```
참가자 폰 (/ask)              운영 노트북 (/operator)           무대 송출 PC (/stage)
  QR 스캔 → 질문 제출  ──▶  실시간 큐에 도착 → 승인/삭제  ──▶  로봇이 음성으로 답변
  (닉네임+소속+질문)          승인 시 AI 답변 자동 생성          (립싱크·자막·QR 상시)
                             무대에서 말하기 버튼으로 송출
```

Firebase Firestore가 세 화면을 실시간으로 잇습니다. 참가자 페이지만 로그인이 필요 없고, 운영·무대 화면은 운영자 로그인이 필요합니다.

## 화면 구성

| 경로 | 로그인 | 용도 |
| --- | --- | --- |
| `/ask` | 불필요 | 참가자 질문 제출(모바일). QR로 접속. 닉네임·소속·질문 입력, 비속어·길이 검증. |
| `/operator` (또는 `/`) | 운영자 | 실시간 큐 선별(승인/삭제/전체삭제/세션리셋), AI 답변 자동 사전 생성, 무대 송출 제어, 무대 연결 상태 표시. |
| `/stage` | 운영자 | 행사장 송출 화면. "무대 시작하기" → 로봇·자막·QR. 운영자가 송출하면 해당 답변을 음성 재생. |

## 운영 절차 (행사 당일)

1. **무대 PC**에서 `/stage`를 열고 **"▶ 무대 시작하기"** 클릭 (브라우저 자동재생 차단 해제 + 음성 프리페치 시작).
2. **운영 노트북**에서 `/operator` 로그인. 상단 칩이 **🟢 무대 연결됨**인지 확인.
3. 행사 시작 전 **세션 리셋**으로 큐를 비웁니다.
4. 참가자가 QR로 낸 질문이 왼쪽 큐에 실시간으로 쌓이면 **승인**. 승인하면 AI가 답변을 자동 생성하고, 무대가 음성을 미리 준비합니다.
5. 준비가 끝난 질문의 **"무대에서 말하기"**를 누르면 무대에서 즉시 재생됩니다.

> 음성 프리페치는 무대 화면(`/stage`)이 담당합니다. 무대가 안 열려 있으면 운영 콘솔에 **⚪ 무대 화면 열어주세요** 경고가 뜹니다. 무대를 먼저 켜세요.

## 인증 · 개인정보 · 보안

- **운영자 인증**: `/operator`·`/stage`는 Firebase 이메일/비밀번호 로그인 게이트 뒤에 있습니다. 계정은 Firebase 콘솔에서 추가/삭제합니다 (공개 회원가입은 차단됨).
- **비용 유발 API 보호**: `/api/generate-answer`·`/api/tts`는 Firebase ID 토큰 검증을 통과해야 호출됩니다(서버가 Google 공개키로 서명 검증, 서비스계정 불필요). 무인증 호출은 401. 입력 길이 상한·본문 크기 제한·간이 레이트리밋으로 비용 폭탄을 차단합니다.
- **개인정보**: 참가자 질문(닉네임·소속·질문)은 행사 중에만 Firestore에 보관하고, **세션 리셋/전체 삭제 시 영구 삭제**됩니다. 생성된 음성은 서버에 저장하지 않고 브라우저 메모리에만 캐시됩니다.
- **Firestore 규칙**(`firestore.rules`): 참가자는 검증된 질문 생성 + 세션ID 읽기만, 질문 목록 읽기·상태 변경·무대 제어는 운영자 전용. `firebase deploy --only firestore:rules`로 배포합니다.
- 정책 문서 초안: `docs/PRIVACY.md`, `docs/TERMS.md`, `docs/REFUND.md` (유료 SaaS 전환 시 법무 검토 필요).

## 3D 로봇 구조

- **모델**: 원본 GLB를 Tripo API로 자동 리깅하고 idle/walk/jump/turn 프리셋 애니메이션을 리타겟한 `public/models/robot-animated.glb`. 파이프라인은 `scripts/tripo_rig.py`로 재실행할 수 있습니다 (`.env`의 `tripo_api_key` 필요).
- **동작**: 스켈레탈 애니메이션은 팔 체인에만 적용하고, 머리·몸통의 생동감(기울임·호흡·말하기 바운스)은 그룹 레벨 모션으로 처리해 얼굴 스크린과 몸이 항상 함께 움직입니다. 다리는 서 있는 자세로 고정.
- **얼굴**: 스크린-얼굴 방식. 머리 앞면 텍스처 플레인에 표정 컷(`public/faces/`)을 갈아끼워 입모양·깜빡임을 만듭니다. Tripo 리그는 본 좌표와 보이는 메시가 어긋나므로 얼굴 플레인을 본에 attach하면 안 됩니다 (`Robot3D.tsx` 주석 참고).
- **등장 연출**: 초록 코드 글리치(클리핑 스윕 + 와이어프레임 + 스캔라인).
- **폴백**: WebGL을 못 쓰는 장비에서는 2D 포즈 이미지로 자동 전환.
- **모바일**: 무대 화면이 좁은 화면에서도 로봇 중앙 정렬·자막 크기·QR 위치가 조정됩니다.

## 음성 · 립싱크 · 자막

- **무대 재생 엔진**: 무대(`/stage`)는 **Gemini TTS**(`gemini-2.5-flash-preview-tts`, 음색 Leda) 고정입니다. 서버는 ElevenLabs·Gemini·OpenAI를 모두 지원하며 `/api/tts`의 `requireProvider`로 엔진을 강제합니다.
- **답변 인사말**: 닉네임 기반으로 "OO님께서 멋진 질문을 주셨네요!"처럼 매번 다르게 시작합니다(형용사·패턴 랜덤). 닉네임이 있으면 "님"이 붙어 조사가 깨지지 않습니다.
- **립싱크**: 재생 오디오의 실제 음량(RMS)을 분석해 입모양(다묾→작은 O→타원→활짝)을 음성에 맞춥니다. 어떤 TTS 엔진과도 동작합니다.
- **자막 동기화**: ElevenLabs는 글자 단위 타임스탬프로, Gemini는 오디오 파형의 무음 구간 분석으로 문장 전환 시각을 계산해 발화에 맞춰 자막을 넘깁니다.
- **비용 절감**: 승인된 질문의 답변 음성을 무대가 미리 프리페치(최대 8개)해, 송출 버튼을 누르면 즉시 재생됩니다.

## 설치

```bash
npm install
```

## 환경변수

`.env.example`을 복사해서 `.env`를 만들고 값을 입력합니다.

```bash
cp .env.example .env
```

| 변수 | 설명 |
| --- | --- |
| `OPENAI_API_KEY` | 답변 생성(OpenAI Responses API)에 필요. |
| `OPENAI_MODEL` / `OPENAI_REASONING_EFFORT` | 답변 생성 모델(`gpt-5.4-mini`)·reasoning(`low`). |
| `GEMINI_API_KEY` / `GEMINI_TTS_MODEL` / `GEMINI_TTS_VOICE` | 무대 기본 음성(Gemini TTS, 음색 `Leda`)에 필요. |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` / `ELEVENLABS_TTS_MODEL` | ElevenLabs 음성(선택). 기본 음색 `14DagiyIoXWe1tnLN3CZ`(디디 A). |
| `OPENAI_TTS_*` | OpenAI TTS 폴백 설정. |
| `VITE_FIREBASE_*` | Firebase 웹 SDK 설정(실시간 큐). **클라이언트 공개값** — Vite가 번들에 인라인하므로 Vercel에도 동일 키로 등록해야 배포 시 적용됩니다. |
| `OPERATOR_EMAIL` / `OPERATOR_PASSWORD` | 운영자 계정 참고용(실제 인증은 Firebase Auth). |
| `tripo_api_key` | 3D 리깅 파이프라인 재실행 시에만 필요. |
| `PORT` | 로컬 서버 포트(기본 5173). |

## 로컬 실행

```bash
npm run dev
```

- 참가자: [http://localhost:5173/ask](http://localhost:5173/ask)
- 운영: [http://localhost:5173/operator](http://localhost:5173/operator)
- 무대: [http://localhost:5173/stage](http://localhost:5173/stage)

같은 와이파이의 폰에서 QR 테스트를 하려면 `http://<로컬IP>:5173/ask`로 접속하세요.

## API

| 엔드포인트 | 인증 | 설명 |
| --- | --- | --- |
| `GET /api/health` | 불필요 | 모델·TTS 설정·API 키 존재 여부 확인. |
| `POST /api/generate-answer` | Firebase ID 토큰 | 질문·닉네임을 받아 MC 답변 생성. |
| `POST /api/tts` | Firebase ID 토큰 | 답변을 음성으로 변환. `requireProvider`, `elevenVoice`, `geminiVoice` 지원. |

```bash
curl https://aidlc-ai-mc.vercel.app/api/health
```

## 테스트와 빌드

```bash
npm test        # vitest (서버·클라이언트·인증·립싱크·자막 등)
npm run build   # tsc 타입체크 + vite 빌드
```

## 배포 (Vercel)

- 환경변수: `.env.example`의 키를 Vercel 프로젝트(Production+Preview)에 등록. `VITE_FIREBASE_*`는 **빌드 시 번들에 인라인**되므로 반드시 등록해야 합니다.
- **주의: 이 프로젝트는 Git 자동 배포 연동이 없습니다.** push만으로는 배포되지 않으니 반드시 CLI로:
  ```bash
  npx vercel --prod --yes
  ```
- 배포 확인:
  ```bash
  curl https://aidlc-ai-mc.vercel.app/api/health
  # 무인증 호출 차단 확인 (401 기대)
  curl -X POST https://aidlc-ai-mc.vercel.app/api/generate-answer \
    -H "Content-Type: application/json" -d '{"question":"테스트"}'
  ```
- Firestore 규칙 배포: `npx firebase-tools deploy --only firestore:rules`

## 프로젝트 구조

```text
api/                 Vercel Serverless Function 진입점 (server 재사용)
assets/              행사 이미지, TTS 음색 샘플, Tripo 파이프라인 상태
docs/                개인정보처리방침·약관·환불정책 초안
public/faces/        로봇 스크린 얼굴 표정 컷 (입모양 사다리 + 깜빡임)
public/models/       Tripo 리깅 + 애니메이션 GLB
scripts/             Tripo 리깅 파이프라인 (tripo_rig.py)
server/              Express API + Vercel 핸들러 + Firebase ID 토큰 검증
src/
  components/        AskPage(참가자), LiveOperator(운영), LiveStage(무대),
                     OperatorGate(로그인), RobotStage, Robot3D, QrCode
  hooks/             useStagePlayer(무대 재생·립싱크·자막)
  lib/               firebase, liveQueue(Firestore 실시간 큐), operatorAuth,
                     questionModeration(검증·비속어), mcFlow, captionAudioSync
firestore.rules      Firestore 보안 규칙
vercel.json          SPA 라우팅 rewrite (/ask, /stage, /operator)
```

## 참고

- AI가 생성한 답변은 부정확할 수 있으므로, 운영자가 승인 전에 확인하고 부적절하면 삭제합니다. 세부 시간표 등 미확인 정보는 AI가 "공식 사이트·운영사무국 확인"으로 안내하도록 설정되어 있습니다.
- AI 호출 비용은 코드로 완전히 막을 수 없으므로, OpenAI·ElevenLabs·Google 콘솔에서 월 예산 상한·결제 알림을 직접 설정하는 것을 권장합니다.
