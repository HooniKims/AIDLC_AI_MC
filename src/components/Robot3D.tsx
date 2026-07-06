import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { RobotState } from "../types";
import { faceForFrame, faceTextureUrls } from "../lib/robotFaces";
import { robotFrameForState } from "../lib/robotFrames";

const MODEL_URL = "/models/robot-animated.glb";

// Tripo animate_retarget 클립 순서: idle, walk, jump, turn
const CLIP_IDLE = "NlaTrack";
const CLIP_JUMP = "NlaTrack.002";

// 스켈레탈 애니메이션은 팔에만 적용한다. 머리/척추가 클립으로 움직이면
// 그룹에 고정된 얼굴 스크린 플레인과 어긋나므로, 머리·몸통의 생동감은
// 그룹 레벨 모션(회전·바운스)으로 처리해 얼굴과 몸이 항상 함께 움직이게 한다.
const IDLE_WEIGHT = 0.75;
// idle 클립을 절반 속도로 돌려 차분한 무대 대기 모션으로 만든다
const IDLE_TIMESCALE = 0.55;

// 대기 중 눈 깜빡임: 주기마다 잠깐 눈 감은 표정으로 교체
const BLINK_PERIOD = 3.4;
const BLINK_DURATION = 0.18;

// 클립에서 허용된 본의 트랙만 남긴다
function filterClipToBones(clip: THREE.AnimationClip, allowedNodes: Set<string>) {
  const tracks = clip.tracks.filter((track) => allowedNodes.has(track.name.split(".")[0]));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

function detectWebGLSupport() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

// Tripo 리깅 결과물은 +X를 바라보므로 -90° 돌려 +Z(카메라)를 보게 한다
const MODEL_ROTATION_Y = -Math.PI / 2;

// 얼굴 스크린 플레인: 그룹 좌표에 고정 배치한다.
// Tripo 리그는 본 월드좌표와 눈에 보이는 메시 위치가 어긋나 있어(스키닝이 보정)
// 본에 attach하면 플레인이 엉뚱한 곳으로 끌려간다 — 절대 본에 붙이지 말 것.
// 대신 말하기 바운스 등 큰 움직임은 그룹 전체에 걸어 얼굴과 몸이 함께 움직인다.
const FACE_PLANE = {
  width: 0.41,
  height: 0.41 * (436 / 512),
  restPosition: new THREE.Vector3(0, 0.6, 0.265),
  tiltX: -0.15
};

// 말하기 시작 바운스(그룹 레벨): 총 길이와 높이
const SPEAK_BOUNCE_DURATION = 0.85;
const SPEAK_BOUNCE_HEIGHT = 0.05;

// 사이버틱 등장 연출: 초록 코드 글리치로 지직거리며 아래→위로 머티리얼라이즈
const ENTRANCE = {
  duration: 2.6,
  sweepHeight: 1.05,
  green: "#39ff6a"
};

interface RobotModelProps {
  state: RobotState;
  lipFrame: number;
  onEntered: () => void;
}

function RobotModel({ state, lipFrame, onEntered }: RobotModelProps) {
  const group = useRef<THREE.Group>(null);
  const facePlane = useRef<THREE.Mesh>(null);
  const faceMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const scanBar = useRef<THREE.Mesh>(null);
  const entranceStart = useRef<number | null>(null);
  const enteredRef = useRef(false);
  const speakBounceRef = useRef(SPEAK_BOUNCE_DURATION);
  const { scene, animations } = useGLTF(MODEL_URL);

  // 팔 체인(0_Left/Right_Limb_*)의 트랙만 남긴다. 다리·척추·머리·루트는 고정.
  const armOnlyAnimations = useMemo(() => {
    const armBones = new Set<string>();
    scene.traverse((object) => {
      if (/0_(Left|Right)_Limb_0$/i.test(object.name)) {
        object.traverse((child) => armBones.add(child.name));
      }
    });
    if (armBones.size === 0) {
      return animations;
    }

    return animations.map((clip) => filterClipToBones(clip, armBones));
  }, [scene, animations]);

  const { actions, mixer } = useAnimations(armOnlyAnimations, group);
  const textures = useTexture(faceTextureUrls);

  // 등장 스윕용 클리핑 플레인(y <= constant 영역만 렌더)과 글리치 와이어프레임 머티리얼
  const clipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), []);
  const glitchMaterial = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      color: ENTRANCE.green,
      wireframe: true,
      transparent: true,
      opacity: 0.85,
      toneMapped: false
    });
    material.clippingPlanes = [clipPlane];
    return material;
  }, [clipPlane]);
  const originalMaterials = useMemo(() => new Map<THREE.Mesh, THREE.Material | THREE.Material[]>(), []);

  useEffect(() => {
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) {
        originalMaterials.set(mesh, mesh.material);
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material) => {
          material.clippingPlanes = [clipPlane];
        });
      }
    });
  }, [scene, clipPlane, originalMaterials]);

  // 모델 정규화: 정면(+Z) 회전 후 바닥 y=0, 중심 x/z=0, 높이 1.0
  useMemo(() => {
    scene.rotation.y = MODEL_ROTATION_Y;
    scene.position.set(0, 0, 0);
    scene.scale.setScalar(1);
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const scale = size.y > 0 ? 1 / size.y : 1;
    scene.scale.setScalar(scale);
    scene.updateMatrixWorld(true);
    box.setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    scene.position.set(-center.x, -box.min.y, -center.z);
  }, [scene]);

  useEffect(() => {
    Object.values(textures).forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
    });
  }, [textures]);

  // 얼굴 플레인은 그룹 좌표에 고정 (본에 붙이지 않는다 — 상단 FACE_PLANE 주석 참고)
  useEffect(() => {
    const plane = facePlane.current;
    if (!plane) {
      return;
    }

    plane.position.copy(FACE_PLANE.restPosition);
    plane.rotation.set(FACE_PLANE.tiltX, 0, 0);
  }, []);

  // 기본 모션: 리깅된 idle 클립 상시 루프
  useEffect(() => {
    const idle = actions[CLIP_IDLE];
    if (!idle) {
      return;
    }
    idle.reset().fadeIn(0.35).play();
    idle.setEffectiveWeight(IDLE_WEIGHT);
    idle.setEffectiveTimeScale(IDLE_TIMESCALE);
    return () => {
      idle.fadeOut(0.25);
    };
  }, [actions]);

  // 말하기 시작 시 그룹 바운스 + jump 클립(상체 모션)을 한 번 재생하고 idle로 복귀
  useEffect(() => {
    if (state !== "speaking") {
      return;
    }
    speakBounceRef.current = 0;
    const jump = actions[CLIP_JUMP];
    const idle = actions[CLIP_IDLE];
    if (!jump || !idle) {
      return;
    }

    jump.setLoop(THREE.LoopOnce, 1);
    jump.clampWhenFinished = false;
    jump.reset().crossFadeFrom(idle, 0.2, false).play();

    const resumeIdle = (fadeDuration: number) => {
      idle.reset().crossFadeFrom(jump, fadeDuration, false).play();
      idle.setEffectiveWeight(IDLE_WEIGHT);
      idle.setEffectiveTimeScale(IDLE_TIMESCALE);
    };
    const handleFinished = (event: { action: THREE.AnimationAction }) => {
      if (event.action === jump) {
        resumeIdle(0.3);
      }
    };
    mixer.addEventListener("finished", handleFinished);
    return () => {
      mixer.removeEventListener("finished", handleFinished);
      if (jump.isRunning()) {
        resumeIdle(0.2);
      }
    };
  }, [state, actions, mixer]);

  useFrame((frameState, delta) => {
    const robot = group.current;
    if (!robot) {
      return;
    }

    const t = frameState.clock.elapsedTime;

    // 등장 연출: 초록 스캔 바가 쓸고 올라오며, 지직거릴 때마다 초록 와이어프레임으로 전환
    if (!enteredRef.current) {
      if (entranceStart.current === null) {
        entranceStart.current = t;
      }
      const elapsed = t - entranceStart.current;

      if (elapsed < ENTRANCE.duration) {
        const progress = elapsed / ENTRANCE.duration;
        const eased = 1 - Math.pow(1 - progress, 2.4);
        clipPlane.constant = eased * ENTRANCE.sweepHeight;

        const noise =
          Math.sin(elapsed * 43.7) * Math.sin(elapsed * 29.3 + 1.6) + Math.sin(elapsed * 61.9) * 0.5;
        const glitching = noise > 0.55;
        originalMaterials.forEach((material, mesh) => {
          mesh.material = glitching ? glitchMaterial : material;
        });
        if (facePlane.current) {
          facePlane.current.visible = !glitching;
        }
        robot.position.x = glitching ? Math.sin(elapsed * 97) * 0.04 : 0;

        const bar = scanBar.current;
        if (bar) {
          bar.visible = true;
          bar.position.y = clipPlane.constant;
        }
        return;
      }

      enteredRef.current = true;
      clipPlane.constant = 1000;
      originalMaterials.forEach((material, mesh) => {
        mesh.material = material;
      });
      if (facePlane.current) {
        facePlane.current.visible = true;
      }
      robot.position.x = 0;
      if (scanBar.current) {
        scanBar.current.visible = false;
      }
      onEntered();
    }

    // 스켈레탈 idle 위에 얹는 가벼운 상태별 보조 모션 (시선은 항상 정면)
    // 루트 이동이 제거된 idle을 보완하는 미세한 호흡 bob 포함
    let targetRotX = 0;
    let targetRotZ = 0;
    let targetY = Math.sin(t * 1.3) * 0.01;

    if (state === "idle") {
      // 팔만 스켈레탈로 움직이므로 몸통·머리의 생동감은 여기서 준다
      targetRotZ = Math.sin(t * 0.55) * 0.022;
      targetRotX = Math.sin(t * 0.8) * 0.014;
    } else if (state === "listening") {
      targetRotX = 0.05;
    } else if (state === "thinking") {
      targetRotZ = 0.06;
    } else if (state === "speaking") {
      targetRotX = Math.sin(t * 1.7) * 0.018;
      targetY = Math.sin(t * 2.2) * 0.016;
    }

    // 말하기 시작 바운스: 감쇠하는 사인 파형으로 통통 뛰는 느낌 (얼굴도 함께 움직인다)
    if (speakBounceRef.current < SPEAK_BOUNCE_DURATION) {
      speakBounceRef.current += delta;
      const progress = Math.min(speakBounceRef.current / SPEAK_BOUNCE_DURATION, 1);
      targetY += Math.abs(Math.sin(progress * Math.PI * 2)) * SPEAK_BOUNCE_HEIGHT * (1 - progress);
    }

    const smoothing = 1 - Math.exp(-6 * delta);
    robot.rotation.x = THREE.MathUtils.lerp(robot.rotation.x, targetRotX, smoothing);
    robot.rotation.z = THREE.MathUtils.lerp(robot.rotation.z, targetRotZ, smoothing);
    robot.position.y = THREE.MathUtils.lerp(robot.position.y, targetY, smoothing);

    // 주기적으로 눈을 깜빡인다 (말하는 중에도 잠깐 감았다 뜨면 자연스럽다)
    const blinking = t % BLINK_PERIOD < BLINK_DURATION;
    const faceKey = faceForFrame(state, lipFrame, blinking);
    const texture = textures[faceKey];
    if (faceMaterial.current && faceMaterial.current.map !== texture) {
      faceMaterial.current.map = texture;
      faceMaterial.current.needsUpdate = true;
    }

    if (import.meta.env.DEV && facePlane.current) {
      const worldPos = facePlane.current.getWorldPosition(new THREE.Vector3());
      (window as unknown as Record<string, unknown>).__robotFaceDebug = {
        faceKey,
        blinking,
        lipFrame,
        visible: facePlane.current.visible,
        parent: facePlane.current.parent?.name || facePlane.current.parent?.type,
        world: worldPos.toArray().map((v) => Number(v.toFixed(3))),
        mapSrc: (faceMaterial.current?.map as THREE.Texture & { source?: { data?: { src?: string } } })?.source
          ?.data?.src
      };
    }
  });

  return (
    <group ref={group}>
      <primitive object={scene} />
      <mesh ref={facePlane} rotation={[FACE_PLANE.tiltX, 0, 0]}>
        <planeGeometry args={[FACE_PLANE.width, FACE_PLANE.height]} />
        <meshBasicMaterial
          ref={faceMaterial}
          map={textures.neutral}
          transparent
          toneMapped={false}
          depthWrite={false}
          clippingPlanes={[clipPlane]}
        />
      </mesh>
      <mesh ref={scanBar} visible={false} position={[0, 0, 0.28]}>
        <planeGeometry args={[0.7, 0.012]} />
        <meshBasicMaterial
          color={ENTRANCE.green}
          transparent
          opacity={0.9}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

interface Robot3DProps {
  state: RobotState;
  lipFrame?: number;
}

export function Robot3D({ state, lipFrame = 0 }: Robot3DProps) {
  const webglSupported = useMemo(detectWebGLSupport, []);
  const [entering, setEntering] = useState(true);

  // 모델 로딩 실패 등으로 onEntered가 안 와도 오버레이가 남지 않게 하는 안전장치
  useEffect(() => {
    const id = window.setTimeout(() => setEntering(false), 8000);
    return () => window.clearTimeout(id);
  }, []);

  const enteringClass = entering ? " robot-canvas--entering" : "";

  if (!webglSupported) {
    // WebGL을 못 쓰는 환경(구형 송출 장비 등)에서는 2D 포즈 이미지로 폴백한다.
    const fallbackFrame = robotFrameForState(state, lipFrame);
    return (
      <div className={`robot-canvas robot-canvas--fallback${enteringClass}`} data-robot-3d="fallback">
        <img
          className="robot-image"
          src={fallbackFrame.imageSrc}
          alt="AI MC 로봇 캐릭터"
          draggable="false"
        />
      </div>
    );
  }

  return (
    <div className={`robot-canvas${enteringClass}`} data-robot-3d="true" data-entering={entering}>
      <Canvas
        camera={{ position: [0, 0.62, 2.0], fov: 33 }}
        gl={{ alpha: true, antialias: true }}
        onCreated={({ gl, camera }) => {
          gl.localClippingEnabled = true;
          camera.lookAt(0, 0.5, 0);
        }}
      >
        <ambientLight intensity={0.9} />
        <hemisphereLight args={["#dff3ff", "#9db6cc", 0.55]} />
        <directionalLight position={[3, 5, 2]} intensity={1.15} />
        <directionalLight position={[-2.4, 2.2, 1.4]} intensity={0.4} />
        <Suspense fallback={null}>
          <RobotModel state={state} lipFrame={lipFrame} onEntered={() => setEntering(false)} />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload(MODEL_URL);
