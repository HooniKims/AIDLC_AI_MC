import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { RobotState } from "../types";
import { faceForFrame, faceTextureUrls } from "../lib/robotFaces";
import { robotFrameForState } from "../lib/robotFrames";

const MODEL_URL = "/robot.glb";

function detectWebGLSupport() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

// 모델 바운딩: 폭 0.51 × 높이 1.0 × 깊이 0.63, 바닥 y=0.
// GLB에는 리깅이 없어 본 회전 대신 그룹 단위 모션을 쓰고,
// 스크린 얼굴은 머리 앞면에 텍스처 플레인을 겹쳐 교체한다.
// Tripo 모델은 +X를 바라보므로 -90° 돌려 +Z(카메라)를 보게 한다
const MODEL_ROTATION_Y = -Math.PI / 2;

const FACE_PLANE = {
  width: 0.52,
  height: 0.52 * (343 / 512),
  position: [0, 0.6, 0.262] as [number, number, number],
  tiltX: -0.15
};

const BLINK_DURATION_MS = 130;

interface RobotModelProps {
  state: RobotState;
  lipFrame: number;
}

function RobotModel({ state, lipFrame }: RobotModelProps) {
  const group = useRef<THREE.Group>(null);
  const faceMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const blinkUntil = useRef(0);
  const { scene } = useGLTF(MODEL_URL);
  const textures = useTexture(faceTextureUrls);

  useEffect(() => {
    Object.values(textures).forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
    });
  }, [textures]);

  useEffect(() => {
    let timeoutId = 0;

    const scheduleBlink = () => {
      timeoutId = window.setTimeout(() => {
        blinkUntil.current = performance.now() + BLINK_DURATION_MS;
        scheduleBlink();
      }, 3200 + Math.random() * 2400);
    };

    scheduleBlink();
    return () => window.clearTimeout(timeoutId);
  }, []);

  useFrame((frameState, delta) => {
    const robot = group.current;
    if (!robot) {
      return;
    }

    const t = frameState.clock.elapsedTime;
    let targetY = Math.sin(t * 1.6) * 0.018;
    let targetRotX = 0;
    let targetRotY = Math.sin(t * 0.5) * 0.04;
    let targetRotZ = Math.sin(t * 0.9) * 0.02;

    if (state === "listening") {
      targetRotX = 0.05 + Math.sin(t * 2.1) * 0.015;
      targetRotY = Math.sin(t * 1.1) * 0.06;
    } else if (state === "thinking") {
      targetY = Math.sin(t * 1.1) * 0.014;
      targetRotY = 0.14 + Math.sin(t * 0.7) * 0.03;
      targetRotZ = 0.07;
    } else if (state === "speaking") {
      targetY = Math.sin(t * 2.6) * 0.026;
      targetRotX = Math.sin(t * 3.2) * 0.03;
      targetRotY = Math.sin(t * 1.4) * 0.07;
      targetRotZ = Math.sin(t * 2.2) * 0.025;
    }

    const smoothing = 1 - Math.exp(-6 * delta);
    robot.position.y = THREE.MathUtils.lerp(robot.position.y, targetY, smoothing);
    robot.rotation.x = THREE.MathUtils.lerp(robot.rotation.x, targetRotX, smoothing);
    robot.rotation.y = THREE.MathUtils.lerp(robot.rotation.y, targetRotY, smoothing);
    robot.rotation.z = THREE.MathUtils.lerp(robot.rotation.z, targetRotZ, smoothing);

    const blinking = performance.now() < blinkUntil.current;
    const faceKey = faceForFrame(state, lipFrame, blinking);
    const texture = textures[faceKey];
    if (faceMaterial.current && faceMaterial.current.map !== texture) {
      faceMaterial.current.map = texture;
      faceMaterial.current.needsUpdate = true;
    }
  });

  return (
    <group ref={group}>
      <primitive object={scene} rotation={[0, MODEL_ROTATION_Y, 0]} />
      <mesh position={FACE_PLANE.position} rotation={[FACE_PLANE.tiltX, 0, 0]}>
        <planeGeometry args={[FACE_PLANE.width, FACE_PLANE.height]} />
        <meshBasicMaterial
          ref={faceMaterial}
          map={textures.neutral}
          transparent
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

  if (!webglSupported) {
    // WebGL을 못 쓰는 환경(구형 송출 장비 등)에서는 2D 포즈 이미지로 폴백한다.
    const fallbackFrame = robotFrameForState(state, lipFrame);
    return (
      <div className="robot-canvas robot-canvas--fallback" data-robot-3d="fallback">
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
    <div className="robot-canvas" data-robot-3d="true">
      <Canvas
        camera={{ position: [0, 0.62, 2.0], fov: 33 }}
        gl={{ alpha: true, antialias: true }}
        onCreated={({ camera }) => {
          camera.lookAt(0, 0.5, 0);
        }}
      >
        <ambientLight intensity={0.9} />
        <hemisphereLight args={["#dff3ff", "#9db6cc", 0.55]} />
        <directionalLight position={[3, 5, 2]} intensity={1.15} />
        <directionalLight position={[-2.4, 2.2, 1.4]} intensity={0.4} />
        <Suspense fallback={null}>
          <RobotModel state={state} lipFrame={lipFrame} />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload(MODEL_URL);
