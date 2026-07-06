# AI MC 로봇 웹앱 · 구현 가이드 (as-built)

> 큐트 로봇 캐릭터를 3D로 반응하는 AI MC로 만든 실제 구현 문서.
> Vite + React + React Three Fiber + Express(Vercel Functions) + Tripo + ElevenLabs 기준.
> 초기 설계(Next.js 계획)에서 실제 구현으로 갱신됨. 구현 중 발견한 함정(§8)을 반드시 읽을 것.

---

## 0. 핵심 아이디어

이 캐릭터는 **얼굴이 디스플레이(스크린)인 로봇**이다.
따라서 표정·립싱크를 3D 얼굴 근육으로 만들 필요가 없다.
**"3D 몸체(GLB) + 스크린에 얼굴 이미지 텍스처를 교체"** 하는 방식이 가장 적은 노력으로 가장 그럴듯한 결과를 낸다.

- 표정/입모양 → 스크린 위 텍스처 플레인에 얼굴 컷(7장)을 갈아끼움
- 몸짓 → Tripo 리깅 클립 중 **팔 체인 트랙만** 재생 + 그룹 레벨 모션
- 생동감 → 호흡 bob + 몸통 기울임 + 3.4초 주기 눈 깜빡임(텍스처 교체)

---

## 1. 실제 아키텍처

```
[/demo /stage /operator]  ← Vite React SPA (같은 useMcSession 훅 공유)
   │  질문 선택/입력 → AI 답변 생성 → 자동 승인 → 로봇 말하기
   ▼
[Express 서버 = Vercel Functions]        ← 비밀키는 서버에만
   ├─ POST /api/generate-answer   OpenAI Responses API
   ├─ POST /api/tts               ElevenLabs(기본) / Gemini / OpenAI(폴백)
   └─ GET  /api/health            키 존재 여부·모델 설정 확인
   ▼
[프론트엔드]
   ├─ 음성 재생 (HTMLAudioElement, blob URL)
   ├─ 립싱크: WebAudio AnalyserNode 음량 → 입모양 사다리 4단계
   ├─ 동작: 팔 스켈레탈 + 그룹 레벨 기울임/바운스
   └─ 등장: 초록 코드 글리치 (클리핑 스윕 + 와이어프레임 + CSS 오버레이)
```

로컬 개발은 `npm run dev`(Express가 Vite 미들웨어 포함, 포트 5173).
배포는 `server/vercelHandler.mjs`가 같은 `createApp`을 Vercel Functions로 감싼다.

**보안 원칙**: ElevenLabs / Gemini / OpenAI / Tripo 키는 **절대 브라우저에 두지 않는다.**
서버 라우트에서만 호출하고, 프론트는 오디오 blob만 받는다.

---

## 2. 3D 모델 파이프라인 (Tripo API)

원본 GLB를 Tripo API로 리깅·애니메이션한다. 전 과정이 `scripts/tripo_rig.py`로 자동화되어 있다.

```bash
# .env에 tripo_api_key 필요, 의존성: pip install tripo3d boto3 aiohttp
python scripts/tripo_rig.py --check-only   # 리깅 가능 여부만 확인 (과금 없음)
python scripts/tripo_rig.py                # 전체 파이프라인 실행
```

파이프라인: `import_model`(GLB 업로드) → `animate_prerigcheck` → `animate_rig`(v2.0)
→ `animate_retarget`(idle/walk/jump/turn 4개 프리셋을 한 GLB로).

- 산출물: `public/models/robot-animated.glb` (앱이 사용, 클립 이름 `NlaTrack`~`NlaTrack.003`)
- 상태 파일: `assets/models/tripo-pipeline-state.json` — 완료된 태스크 ID를 기억해 재실행 시 재과금 없이 건너뜀
- 비용: 전체 1회 약 65크레딧 (리깅 ~20 + 리타겟)

---

## 3. 3D 로봇 구현 (`src/components/Robot3D.tsx`)

### 3-1. 모델 정규화
Tripo 결과물은 +X를 바라보므로 scene을 -90° Y회전 후, 바닥 y=0 / 중심 x·z=0 / 높이 1.0으로 정규화한다.

### 3-2. 동작 설계 — 팔만 스켈레탈, 나머지는 그룹 레벨
```
스켈레탈 (클립 트랙 필터링)     그룹 레벨 (useFrame 절차적)
├─ 0_Left_Limb_* (왼팔)         ├─ 호흡 bob (y 사인파)
└─ 0_Right_Limb_* (오른팔)      ├─ 상태별 기울임 (경청/생각/말하기)
                                ├─ idle 몸통 스웨이
   다리·척추·머리·루트 = 고정    └─ 말하기 시작 바운스 (감쇠 사인)
```
- `filterClipToBones()`로 팔 체인 트랙만 남긴다 (`IDLE_WEIGHT 0.75`, `IDLE_TIMESCALE 0.55`)
- 휴머노이드 클립을 짧은 다리에 그대로 적용하면 다리가 꼬인다 → 다리 트랙 제거로 해결
- 말하기 시작 시 jump 클립(팔 모션)+그룹 바운스를 함께 재생

### 3-3. 얼굴 스크린 플레인 — ⚠️ 본에 attach 금지
얼굴 플레인은 **그룹 좌표 (0, 0.6, 0.265)에 고정**한다.
Tripo 리그는 본 월드좌표와 눈에 보이는 메시 위치가 어긋나 있어(스키닝이 보정),
`headBone.attach(plane)`을 하면 애니메이션 시작 시 플레인이 로봇 뒤 위쪽으로 끌려간다.
머리를 클립으로 움직이지 않고 그룹 레벨로만 움직이므로 고정 플레인이 항상 정렬된다.

### 3-4. 등장 연출 (초록 코드 글리치, ~2.6초)
- 3D: 클리핑 플레인이 아래→위로 스윕하며 머티리얼라이즈 + 노이즈 타이밍에 초록 와이어프레임 스왑 + 스캔 바
- CSS(`robot-canvas--entering`): 스캔라인·코드 레인 오버레이 + 지터 필터
- 모델 로딩 실패 대비 8초 안전 타임아웃
- WebGL 미지원 장비는 2D 포즈 이미지 폴백 (같은 CSS 글리치 적용)

---

## 4. 얼굴 시스템 (`src/lib/robotFaces.ts`, `public/faces/`)

| 컷 | 파일 | 용도 |
|----|------|------|
| neutral | face_neutral.png | 일자 입 (무음) |
| surprised | face_surprised.png | 작은 O (낮은 음량) |
| smileOpen | face_smile_open.png | 타원 (중간 음량) |
| open | face_open.png | 활짝 D (높은 음량) |
| blink | face_blink.png | **감은 눈 ⌣⌣** (합성 생성) |
| slight / happyClosed | 나머지 | 생각 표정 등 보조 |

- **입모양 사다리**: `speakingFaceSequence = [neutral, surprised, smileOpen, open]` — 입이 벌어지는 크기 순. 음량 레벨이 인덱스로 매핑된다.
- **깜빡임**: `faceForFrame(state, lipFrame, blinking)`에서 blink가 최우선 (말하는 중에도). 주기 3.4초, 길이 0.18초.
- `face_blink.png`는 face_neutral에서 눈을 지우고(깨끗한 스크린 픽셀에 2차 곡면 피팅으로 복원) 감은 눈 아크를 그려 합성했다. 재생성 스크립트는 세션 기록 참고 (PIL 기반).

---

## 5. 립싱크 (`src/hooks/useMcSession.ts`)

재생 중인 오디오에 WebAudio `AnalyserNode`를 연결해 **실제 음량(RMS)**을 120ms 간격으로 측정한다.

```
rms → 최근 피크 대비 정규화 → lipFrameForLevel() → 입모양 사다리 인덱스
```

- **피크 감쇠가 핵심**: `lipPeakDecay = 0.92` (tick당 8%). 감쇠가 느리면 도입부의 큰 소리에
  피크가 고정되어 이후 입이 계속 "다문 입" 판정이 난다 (실제로 겪은 버그).
- 무음 게이트 `lipSilenceFloor = 0.015` 아래는 입을 다문다.
- AudioContext는 running 상태일 때만 오디오를 재라우팅 — 연결 실패해도 소리는 정상 재생.
- 분석기를 못 쓰는 환경은 기존 순환 방식으로 폴백.
- 엔진 무관: ElevenLabs든 Gemini든 재생 오디오를 분석하므로 동일하게 동작한다.

업그레이드 경로: ElevenLabs 유료 플랜의 `with-timestamps` 엔드포인트로 글자 단위 타이밍을 받으면
"이 글자를 발음하는 순간 이 입모양" 수준의 정밀 립싱크·자막 싱크가 가능하다.

---

## 6. 음성 엔진 (`server/index.mjs` `/api/tts`)

- **기본: ElevenLabs** (`eleven_multilingual_v2`, 기본 음색 Jessica `cgSgspJ2msm6clMCkdW9`)
- 운영 콘솔에서 Gemini(`gemini-2.5-flash-preview-tts`, Leda)로 전환 가능
- 클라이언트가 `requireProvider`를 보내 한 답변 안에서 엔진이 섞이지 않게 **강제 고정**
  — 실패 시 다른 엔진으로 폴백하지 않고 오류 표시 (무대에서 목소리가 갑자기 바뀌는 사고 방지)
- 음색 선택: ElevenLabs 4종(Jessica/Laura/Bella/Sarah), Gemini 5종 — localStorage에 저장
- 답변 생성 → 자동 승인 → 백그라운드 TTS 사전 생성 → `로봇 말하기` 즉시 재생

### ElevenLabs 무료 티어 제약 (실측)
- 월 10,000 크레딧(≈글자 수). 한국어 답변 1개 ≈ 100~150자
- **라이브러리(커뮤니티) 보이스는 API 호출 불가** (402 `paid_plan_required`) — 기본 제공 보이스만 가능
- 유료(Starter $5~) 전환 시: 한국어 네이티브 보이스(JY, Claire 등) + 타임스탬프 립싱크
- 음색 비교 샘플: `assets/tts-samples/*.mp3`

---

## 7. 배포 (Vercel)

- **⚠️ Git 연동이 안 되어 있다** — push해도 자동 배포되지 않는다. 반드시 CLI로:
  ```bash
  npx vercel --prod --yes
  ```
- 환경 변수는 Vercel 프로젝트(Production + Preview)에 등록: `.env.example`의 키 전부
  (`tripo_api_key`, `PORT` 제외 가능). CLI: `printf '%s' "값" | npx vercel env add KEY production`
- 배포 확인:
  ```bash
  curl https://aidlc-ai-mc.vercel.app/api/health
  # primaryTtsProvider: "elevenlabs", hasElevenLabsApiKey: true 확인
  curl -X POST https://aidlc-ai-mc.vercel.app/api/tts \
    -H "Content-Type: application/json" \
    -d '{"text":"배포 테스트입니다.","requireProvider":"elevenlabs"}' -o /dev/null -D -
  # X-AI-MC-TTS-Provider: elevenlabs 헤더 확인
  ```

---

## 8. 구현 중 발견한 함정 (트러블슈팅)

| 증상 | 원인 | 해결 |
|------|------|------|
| 입모양이 화면에서 안 변함 (데이터는 정상) | 얼굴 플레인을 머리 본에 attach → 애니메이션 시작 시 본 좌표 어긋남으로 플레인이 로봇 뒤로 이동, 모델의 고정 얼굴만 보임 | 플레인 그룹 고정 (§3-3) |
| 말 시작만 입이 움직이고 멈춤 | 립싱크 피크 감쇠가 너무 느려 도입부 음량에 기준 고정 | `lipPeakDecay 0.92` (§5) |
| 눈 깜빡임이 안 보임 | `face_happy_closed.png`가 이름과 달리 눈 뜬 이미지 | 진짜 감은 눈 `face_blink.png` 합성 (§4) |
| 다리가 꼬여 매달린 자세 | 휴머노이드 idle 클립을 짧은 다리에 풀 가중치 적용 | 다리 트랙 제거, 팔만 애니메이션 (§3-2) |
| 얼굴과 머리가 가끔 어긋남 | 머리/척추 트랙이 고정 플레인과 별개로 움직임 | 머리·척추도 트랙 제거, 그룹 모션으로 일원화 |
| ElevenLabs 한국어 보이스 402 | 무료 티어는 라이브러리 보이스 API 불가 | 기본 보이스 사용 or 유료 전환 (§6) |
| push해도 배포 안 됨 | Vercel Git 연동 없음 | `npx vercel --prod` (§7) |

---

## 9. 확장 아이디어

- ElevenLabs 유료 전환 → 한국어 네이티브 보이스 + 타임스탬프 정밀 립싱크/자막
- `/stage`와 `/operator`를 다른 기기에서 열 때의 상태 동기화 (BroadcastChannel/서버 푸시) — 현재는 탭별 독립 상태라 `/demo` 한 화면 운영 기준
- walk/turn 클립 활용 (등장·퇴장 연출)
- 관객 질문 STT 입력

## 10. 진행 순서 요약 (재현용)

1. `cp .env.example .env` 후 키 입력 (OpenAI, ElevenLabs, Gemini)
2. `npm install && npm run dev` → `/demo`에서 리허설
3. 모델을 다시 만들 일이 있으면: 원본 GLB 준비 → `python scripts/tripo_rig.py`
4. `npm test && npm run build` 통과 확인
5. `npx vercel --prod --yes` 배포 → §7 배포 확인 커맨드 실행
