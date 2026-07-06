# AI MC 로봇 웹앱 · 구현 가이드

> 큐트 로봇 캐릭터를 3D로 반응하는 AI MC로 만들어 `aidlc-ai-mc.vercel.app/operator`에 붙이기 위한 전체 설계 문서.
> Next.js + React Three Fiber + ElevenLabs 기준. Claude Code에 그대로 넣어 작업 가능하도록 정리함.

---

## 0. 핵심 아이디어

이 캐릭터는 **얼굴이 디스플레이(스크린)인 로봇**이다.
따라서 표정·립싱크를 3D 얼굴 근육으로 만들 필요가 없다.
**"3D 몸체(GLB) + 스크린에 얼굴 이미지 텍스처를 교체"** 하는 방식이 가장 적은 노력으로 가장 그럴듯한 결과를 낸다.

- 표정/입모양 → 스크린 메시에 얼굴 컷(12장) 텍스처를 갈아끼움
- 몸짓 → 리깅된 본(팔·머리)을 코드로 회전
- 생동감 → 대기 중 bobbing + 랜덤 눈 깜빡임(텍스처 교체)

---

## 1. 전체 아키텍처

```
[/operator 페이지]
   │  질문 입력
   ▼
[Vercel API Route: /api/answer]   ← 서버(비밀키 보관)
   │  1) LLM 호출 → 답변 텍스트
   │  2) ElevenLabs 호출 → 음성(mp3) + (선택)타임스탬프
   ▼
[프론트엔드 (React Three Fiber)]
   ├─ 음성 재생 (HTMLAudioElement)
   ├─ 립싱크: 음량/타임스탬프 → 스크린 얼굴 텍스처 교체
   ├─ 제스처: 상황별 본 회전
   └─ 대기 모션: bobbing + blink
```

**보안 원칙**: ElevenLabs / LLM API 키는 **절대 브라우저에 두지 않는다.**
반드시 Vercel API Route(서버)에서만 호출하고, 프론트는 결과만 받는다.

---

## 2. 준비물 & 스택

| 항목 | 사용 |
|------|------|
| 프레임워크 | Next.js (App Router) — Vercel 배포 |
| 3D 렌더 | `three`, `@react-three/fiber`, `@react-three/drei` |
| 음성 | ElevenLabs API (`text-to-speech`) |
| 답변 생성 | LLM API (Claude 등) |
| 3D 모델 | Tripo에서 생성한 **GLB (리깅 포함)** |
| 얼굴 자산 | 얼굴 클로즈업 컷 12장 (PNG) |

설치:
```bash
npm install three @react-three/fiber @react-three/drei
```

---

## 3. GLB 준비 (Tripo)

1. **모델 생성** — HD 모델 / 울트라 메시 ON / 텍스처 4K / PBR ON
2. **토폴로지: 쿼드** — 애니메이션 변형 안정성
3. **폴리곤 수: 30,000~50,000** — 웹 실시간 구동에 적합 (200만은 과함)
4. 생성 완료 후 왼쪽 **"애니메이션" 탭 → 오토리깅** 적용
   - 리깅이 있어야 팔·머리 제스처 제어 가능
5. **GLB(.glb) 형식으로 export**
6. 파일을 프로젝트 `public/robot.glb` 위치에 저장
7. 얼굴 컷 12장은 `public/faces/` 폴더에 저장
   - 예: `face_neutral.png`, `face_open.png`, `face_smile_open.png`,
     `face_surprised.png`, `face_slight.png`, `face_happy_closed.png` 등

> ⚠️ 리깅 후에는 본(bone) 이름을 확인해 둘 것. 팔/머리 본 이름이 제스처 코드에 필요하다.

---

## 4. 프로젝트 구조

```
app/
  operator/
    page.tsx              # 오퍼레이터 화면 (질문 입력 + 3D 무대)
  api/
    answer/route.ts       # 서버: LLM + ElevenLabs 호출
components/
  RobotStage.tsx          # <Canvas> 3D 무대
  RobotModel.tsx          # GLB 로드 + 표정/립싱크/모션
lib/
  useLipSync.ts           # 음량 기반 립싱크 훅
public/
  robot.glb
  faces/*.png
```

---

## 5. 단계별 구현

### 5-1. 서버 라우트 — LLM + ElevenLabs (핵심: 키 보호)

`app/api/answer/route.ts`
```ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { question } = await req.json();

  // 1) LLM으로 답변 생성 (예: Claude API)
  //    실제 답변 생성 로직으로 교체
  const answerText = await generateAnswer(question);

  // 2) ElevenLabs TTS 호출
  const voiceId = process.env.ELEVENLABS_VOICE_ID!;
  const ttsRes = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY!, // 서버에서만 사용
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: answerText,
        model_id: "eleven_multilingual_v2", // 한국어 지원 모델
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );

  const audioBuffer = await ttsRes.arrayBuffer();
  const audioBase64 = Buffer.from(audioBuffer).toString("base64");

  return NextResponse.json({
    text: answerText,
    audio: `data:audio/mpeg;base64,${audioBase64}`,
  });
}

async function generateAnswer(question: string): Promise<string> {
  // TODO: LLM API 연결
  return "안녕하세요! 무엇을 도와드릴까요?";
}
```

환경변수 (`.env.local` + Vercel 프로젝트 설정):
```
ELEVENLABS_API_KEY=xxxxx
ELEVENLABS_VOICE_ID=xxxxx
```

> 립싱크 정확도를 높이려면 `with-timestamps` 엔드포인트를 사용해 글자별 타이밍도 함께 받는다 (방식 B, 아래 5-4 참고).

---

### 5-2. 3D 무대

`components/RobotStage.tsx`
```tsx
"use client";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import { RobotModel } from "./RobotModel";

export function RobotStage({ audioUrl }: { audioUrl: string | null }) {
  return (
    <Canvas camera={{ position: [0, 1.2, 3.2], fov: 40 }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 2]} intensity={1.2} />
      <Environment preset="city" />
      <RobotModel audioUrl={audioUrl} />
      {/* 개발 중 시점 조정용. 배포 시 제거/제한 가능 */}
      <OrbitControls enablePan={false} />
    </Canvas>
  );
}
```

---

### 5-3. 로봇 모델 — 로드 + 얼굴 텍스처 + 모션

`components/RobotModel.tsx`
```tsx
"use client";
import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { useLipSync } from "@/lib/useLipSync";

const FACES = {
  closed: "/faces/face_neutral.png",
  mid:    "/faces/face_slight.png",
  open:   "/faces/face_open.png",
  smile:  "/faces/face_smile_open.png",
  blink:  "/faces/face_happy_closed.png",
};

export function RobotModel({ audioUrl }: { audioUrl: string | null }) {
  const group = useRef<THREE.Group>(null);
  const { scene } = useGLTF("/robot.glb");
  const textures = useTexture(FACES);

  // 텍스처 색공간 보정
  useEffect(() => {
    Object.values(textures).forEach((t) => (t.colorSpace = THREE.SRGBColorSpace));
  }, [textures]);

  // 얼굴 스크린 메시 찾기 (최초 1회, 이름은 GLB에 맞게 수정)
  const screenMat = useMemo(() => {
    let mat: THREE.MeshStandardMaterial | null = null;
    scene.traverse((o: any) => {
      // 콘솔에 이름 찍어보고 스크린 메시명으로 교체할 것
      // console.log(o.name);
      if (o.isMesh && /screen|face|display/i.test(o.name)) {
        mat = o.material as THREE.MeshStandardMaterial;
      }
    });
    return mat;
  }, [scene]);

  // 립싱크: 음량 → 'closed' | 'mid' | 'open' | 'smile'
  const mouthState = useLipSync(audioUrl);

  // 눈 깜빡임 타이머
  const blinkUntil = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      blinkUntil.current = performance.now() + 130; // 130ms 깜빡
    }, 3000 + Math.random() * 2500);
    return () => clearInterval(id);
  }, []);

  useFrame((state) => {
    // 1) 대기 bobbing
    if (group.current) {
      group.current.position.y = Math.sin(state.clock.elapsedTime * 1.6) * 0.04;
    }
    // 2) 얼굴 텍스처 결정 (깜빡임 우선)
    if (screenMat) {
      const blinking = performance.now() < blinkUntil.current;
      const key = blinking ? "blink" : mouthState; // closed/mid/open/smile
      const tex = (textures as any)[key] ?? textures.closed;
      if (screenMat.map !== tex) {
        screenMat.map = tex;
        screenMat.needsUpdate = true;
      }
    }
  });

  return <primitive ref={group} object={scene} scale={1} />;
}

useGLTF.preload("/robot.glb");
```

> 스크린 메시 이름을 모르면, `scene.traverse`에서 `console.log(o.name)`으로 전부 찍어 확인한 뒤 정규식(`/screen|face|display/i`)을 실제 이름에 맞게 교체한다.

---

### 5-4. 립싱크 훅

**방식 A — 음량 기반 (기본, 간단)**

`lib/useLipSync.ts`
```ts
"use client";
import { useEffect, useRef, useState } from "react";

type Mouth = "closed" | "mid" | "open" | "smile";

export function useLipSync(audioUrl: string | null): Mouth {
  const [mouth, setMouth] = useState<Mouth>("closed");
  const raf = useRef<number>(0);

  useEffect(() => {
    if (!audioUrl) { setMouth("closed"); return; }

    const audio = new Audio(audioUrl);
    const ctx = new AudioContext();
    const src = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    analyser.connect(ctx.destination);

    const data = new Uint8Array(analyser.frequencyBinCount);

    const loop = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      // 임계값은 실제 음성에 맞게 튜닝
      if (avg < 12) setMouth("closed");
      else if (avg < 30) setMouth("mid");
      else if (avg < 55) setMouth("open");
      else setMouth("smile");
      raf.current = requestAnimationFrame(loop);
    };

    audio.play().then(() => loop());
    audio.onended = () => setMouth("closed");

    return () => {
      cancelAnimationFrame(raf.current);
      audio.pause();
      ctx.close();
    };
  }, [audioUrl]);

  return mouth;
}
```

**방식 B — 타임스탬프 기반 (더 정교)**

- 서버에서 ElevenLabs `/v1/text-to-speech/{voice_id}/with-timestamps` 호출
- 응답의 `alignment.characters` + `character_start_times_seconds`를 함께 프론트로 전달
- 오디오 `currentTime`에 맞춰 현재 발음 중인 글자를 찾고,
  모음(ㅏ/ㅣ/ㅜ/ㅗ)·자음 계열에 따라 입모양 컷을 매핑
- 음량 방식보다 부드럽고 발음 느낌이 살아남

> 시작은 방식 A로 붙여 동작을 확인하고, 완성도를 높일 때 방식 B로 교체하는 순서를 권장.

---

### 5-5. 제스처 (본 회전)

리깅 후 확인한 본 이름을 이용해 상황별 동작 부여.

```ts
// 예시: 답변 시작 시 인사 제스처
function playGesture(scene: THREE.Object3D, type: "wave" | "nod" | "idle") {
  const arm = scene.getObjectByName("Arm_R"); // 실제 본 이름으로 교체
  const head = scene.getObjectByName("Head");
  // Tween.js / GSAP 또는 useFrame에서 시간 기반 보간으로 회전값 조절
  // wave: arm.rotation.z 를 좌우로 흔들기
  // nod: head.rotation.x 를 살짝 끄덕이기
}
```

- 인사말 답변 → `wave`
- 설명/안내 → `nod` (가벼운 끄덕임)
- 대기 → `idle` (bobbing만)

> 복잡한 모션캡처 불필요. 팔·머리 본 1~2개의 회전만으로 충분히 살아있는 느낌이 난다.

---

### 5-6. /operator 페이지 통합

`app/operator/page.tsx`
```tsx
"use client";
import { useState } from "react";
import { RobotStage } from "@/components/RobotStage";

export default function OperatorPage() {
  const [q, setQ] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  async function ask() {
    if (!q.trim()) return;
    setLoading(true);
    const res = await fetch("/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q }),
    });
    const data = await res.json();
    setAnswer(data.text);
    setAudioUrl(data.audio); // base64 data URL → 립싱크 훅이 재생
    setLoading(false);
  }

  return (
    <div style={{ display: "grid", gridTemplateRows: "1fr auto", height: "100vh" }}>
      <div style={{ position: "relative" }}>
        <RobotStage audioUrl={audioUrl} />
        {answer && <div className="caption">{answer}</div>}
      </div>
      <div style={{ display: "flex", gap: 8, padding: 16 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="질문을 입력하세요"
          style={{ flex: 1, padding: 12, borderRadius: 12 }}
        />
        <button onClick={ask} disabled={loading}>
          {loading ? "생각 중..." : "질문"}
        </button>
      </div>
    </div>
  );
}
```

---

## 6. 보안 체크리스트

- [ ] ElevenLabs / LLM API 키는 **서버(API Route)에서만** 사용, 프론트 노출 금지
- [ ] `.env.local`은 커밋하지 않음 (`.gitignore` 확인)
- [ ] Vercel 프로젝트 환경변수에 키 등록
- [ ] API Route에 **호출 제한(rate limit)** 적용 — TTS 비용 폭주 방지
- [ ] 입력값(question) 길이 제한 — 과도한 TTS 요청 차단
- [ ] 필요 시 간단한 인증/토큰으로 오퍼레이터 페이지 보호

---

## 7. 성능 & 배포 팁

- **GLB 폴리곤 3~5만 유지** — 모바일에서도 부드럽게 구동
- 텍스처 4K로 충분 (8K는 로딩 부담)
- `useGLTF.preload`로 초기 로딩 최적화
- 얼굴 컷 PNG는 적절히 압축 (각 100KB 내외 목표)
- 음성은 스트리밍 대신 완성본 재생이 립싱크 동기화에 유리
- 첫 방문 시 AudioContext는 **사용자 클릭 이후 생성** (브라우저 자동재생 정책)

---

## 8. 확장 아이디어

- 답변 감정에 따라 얼굴 컷 자동 선택 (기쁨→활짝웃음, 놀람→o입)
- 로딩 중 "생각 중" 표정/포즈 표시
- 음성 인식(STT) 연동으로 말로 질문받기
- 여러 대기 모션 랜덤 재생으로 지루함 방지
- 대화 로그 저장 및 자주 묻는 질문 캐싱(TTS 재사용 → 비용 절감)

---

## 9. 진행 순서 요약

1. Tripo에서 GLB(리깅 포함) 완성 → `public/robot.glb`
2. 얼굴 컷 12장 → `public/faces/`
3. `npm install three @react-three/fiber @react-three/drei`
4. 스크린 메시 이름 / 본 이름 콘솔로 확인
5. 방식 A 립싱크로 먼저 동작 확인
6. 제스처(본 회전) 추가
7. ElevenLabs 서버 라우트 연결 (키 보호)
8. 완성도 높이기 → 방식 B(타임스탬프) 립싱크로 교체
9. Vercel 배포 + 환경변수 등록
