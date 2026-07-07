import { useEffect, useMemo, useRef, useState } from "react";
import { RobotStage } from "./RobotStage";
import { QrCode } from "./QrCode";
import { useStagePlayer } from "../hooks/useStagePlayer";
import { isFirebaseConfigured } from "../lib/firebase";
import {
  ensureControl,
  markAudioReady,
  markSpoken,
  reportStageHeartbeat,
  reportStageStatus,
  watchControl,
  watchSessionQuestions,
  type LiveControl,
  type LiveQuestion,
  type StageStatus
} from "../lib/liveQueue";

// 답변 준비된 질문의 TTS를 미리 받아둘 개수. Gemini 생성이 10~20초 걸리므로
// 넉넉히 잡아 운영자가 순서를 건너뛰어도 침묵 대기가 없게 한다.
const PREFETCH_COUNT = 8;

function askUrl(): string {
  if (typeof window === "undefined") {
    return "/ask";
  }
  return `${window.location.origin}/ask`;
}

function questionLabel(question: LiveQuestion): string {
  return `${question.affiliation} ${question.nickname} · ${question.text}`;
}

export function LiveStage() {
  const player = useStagePlayer();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [control, setControl] = useState<LiveControl | null>(null);
  const [questions, setQuestions] = useState<LiveQuestion[]>([]);
  // 자동재생 정책: 페이지 로드 후 클릭이 한 번은 있어야 소리가 난다.
  // 시작 버튼으로 상호작용을 먼저 확보해 방송 중 차단을 원천 방지한다.
  const [started, setStarted] = useState(false);
  const lastNonceRef = useRef<number | null>(null);
  const handlingRef = useRef(false);
  const configured = isFirebaseConfigured();

  // 세션 확보 + 제어 상태 구독
  useEffect(() => {
    if (!configured) {
      return;
    }
    let unwatch: (() => void) | undefined;
    ensureControl()
      .then((id) => {
        setSessionId(id);
        unwatch = watchControl((next) => {
          setControl(next);
          if (next?.sessionId) {
            setSessionId(next.sessionId);
          }
        });
      })
      .catch(() => undefined);
    return () => unwatch?.();
  }, [configured]);

  // 현재 세션 질문 구독
  useEffect(() => {
    if (!configured || !sessionId) {
      return;
    }
    return watchSessionQuestions(sessionId, setQuestions);
  }, [configured, sessionId]);

  // 답변 준비된 질문(승인 순)들의 TTS 오디오를 미리 받아 캐시
  const readyQueue = useMemo(
    () =>
      questions
        .filter((q) => q.answerReady && q.answer && (q.status === "answered" || q.status === "approved"))
        .sort((a, b) => (a.approvedAt ?? 0) - (b.approvedAt ?? 0)),
    [questions]
  );

  // 프리페치 완료 시 audioReady를 보고해 운영 콘솔 버튼이 열리게 한다.
  // (캐시 히트면 즉시 resolve되므로 중복 실행돼도 비용 없음)
  useEffect(() => {
    readyQueue.slice(0, PREFETCH_COUNT).forEach((q) => {
      if (!q.answer) {
        return;
      }
      void player.prepare(q.answer).then((ready) => {
        if (ready && !q.audioReady) {
          markAudioReady(q.id).catch(() => undefined);
        }
      });
    });
  }, [readyQueue, player]);

  const nowPlaying = useMemo(
    () => (control?.nowPlayingId ? questions.find((q) => q.id === control.nowPlayingId) ?? null : null),
    [control?.nowPlayingId, questions]
  );

  // speakNonce 증가 시 해당 질문 답변을 재생. 최초 스냅샷의 stale nonce는 무시.
  useEffect(() => {
    if (!control) {
      return;
    }
    if (lastNonceRef.current === null) {
      lastNonceRef.current = control.speakNonce;
      return;
    }
    if (control.speakNonce <= lastNonceRef.current) {
      return;
    }
    lastNonceRef.current = control.speakNonce;

    const target = control.nowPlayingId
      ? questions.find((q) => q.id === control.nowPlayingId)
      : undefined;
    if (!target || !target.answer || handlingRef.current) {
      return;
    }

    handlingRef.current = true;
    void player
      .play(target.answer)
      .then(() => markSpoken(target.id).catch(() => undefined))
      .catch(() => undefined)
      .finally(() => {
        handlingRef.current = false;
      });
  }, [control, questions, player]);

  // 무대 재생 상태를 제어 문서로 보고 → 운영 콘솔이 "클릭 반응"을 실시간 표시
  useEffect(() => {
    if (!configured) {
      return;
    }
    const status: StageStatus = player.audioBlocked
      ? "blocked"
      : player.robotState === "speaking"
        ? "speaking"
        : player.robotState === "thinking"
          ? "preparing"
          : "idle";
    reportStageStatus(status).catch(() => undefined);
  }, [configured, player.robotState, player.audioBlocked]);

  // 무대 하트비트: 이 화면이 살아있음을 10초마다 알려 운영 콘솔이 연결 여부를 안다.
  useEffect(() => {
    if (!configured) {
      return;
    }
    reportStageHeartbeat().catch(() => undefined);
    const id = window.setInterval(() => {
      reportStageHeartbeat().catch(() => undefined);
    }, 10_000);
    return () => window.clearInterval(id);
  }, [configured]);

  if (!configured) {
    return (
      <main className="stage-screen">
        <div className="live-stage-notice">Firebase 설정이 필요합니다. .env를 확인해 주세요.</div>
      </main>
    );
  }

  const questionText = nowPlaying ? questionLabel(nowPlaying) : undefined;

  return (
    <main className="stage-screen stage-screen--live">
      <RobotStage
        state={player.robotState}
        question={player.isSpeaking ? questionText : undefined}
        answer={player.spokenText}
        lipFrame={player.lipFrame}
        captionCueIndex={player.captionCueIndex}
        variant="full"
      />
      <aside
        // key로 상태 전환 시 재마운트해 위치는 점프, 페이드인만 재생 (자막 위 비행 방지)
        key={player.isSpeaking ? "compact" : "idle"}
        className={`stage-qr ${player.isSpeaking ? "stage-qr--compact" : "stage-qr--idle"}`}
      >
        <QrCode value={askUrl()} size={player.isSpeaking ? 132 : 220} className="stage-qr__img" />
        <div className="stage-qr__caption">
          <strong>QR을 찍고 질문하기</strong>
          <span>궁금한 걸 남기면 AI MC가 답해드려요</span>
        </div>
      </aside>

      {player.robotState === "thinking" ? (
        <div className="stage-preparing" role="status">
          <span className="stage-preparing__dots" aria-hidden="true" />
          삐빗! 답변 음성을 준비하고 있어요
        </div>
      ) : null}

      {player.audioBlocked && started ? (
        <button type="button" className="stage-audio-unlock" onClick={player.retryBlocked}>
          <strong>🔊 소리가 차단됐어요</strong>
          <span>화면을 한 번 클릭하면 답변을 재생해요</span>
        </button>
      ) : null}

      {!started ? (
        <button
          type="button"
          className="stage-start"
          onClick={() => {
            setStarted(true);
            // 시작 전에 원격 재생이 왔다가 차단된 경우, 이 클릭(제스처)으로 즉시 재생
            if (player.audioBlocked) {
              player.retryBlocked();
            }
          }}
        >
          <span className="stage-start__icon" aria-hidden="true">
            ▶
          </span>
          <strong>무대 시작하기</strong>
          <span>클릭하면 소리가 켜지고 무대가 시작돼요</span>
        </button>
      ) : null}
    </main>
  );
}
