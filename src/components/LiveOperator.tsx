import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isFirebaseConfigured } from "../lib/firebase";
import { plainMcCopy } from "../lib/mcFlow";
import { authedFetch } from "../lib/operatorAuth";
import {
  approveQuestion,
  clearAllQuestions,
  deleteQuestion,
  ensureControl,
  requestSpeak,
  resetSession,
  saveAnswer,
  watchControl,
  watchSessionQuestions,
  type LiveControl,
  type LiveQuestion
} from "../lib/liveQueue";

function byApprovedAt(a: LiveQuestion, b: LiveQuestion) {
  return (a.approvedAt ?? 0) - (b.approvedAt ?? 0);
}

function byCreatedAt(a: LiveQuestion, b: LiveQuestion) {
  return a.createdAt - b.createdAt;
}

async function generateAnswerText(questionText: string, nickname: string): Promise<string> {
  const response = await authedFetch("/api/generate-answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // 닉네임을 함께 보내 "{닉네임}님이 궁금해하신 내용이네요!"처럼 자연스러운 인사말을 만든다
    body: JSON.stringify({ question: questionText, nickname })
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "답변 생성에 실패했습니다.");
  }
  return plainMcCopy(payload.answer || "");
}

export function LiveOperator() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [control, setControl] = useState<LiveControl | null>(null);
  const [questions, setQuestions] = useState<LiveQuestion[]>([]);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [speakRequestedId, setSpeakRequestedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const genLockRef = useRef(false);
  const configured = isFirebaseConfigured();

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
      .catch(() => setError("Firebase 연결에 실패했습니다."));
    return () => unwatch?.();
  }, [configured]);

  useEffect(() => {
    if (!configured || !sessionId) {
      return;
    }
    return watchSessionQuestions(sessionId, setQuestions);
  }, [configured, sessionId]);

  const pending = useMemo(
    () => questions.filter((q) => q.status === "pending").sort(byCreatedAt),
    [questions]
  );

  // 승인된(=선별된) 질문 큐: 답변 대기/생성/완료/방송완료 순서 유지
  const answerQueue = useMemo(
    () =>
      questions
        .filter((q) => ["approved", "answered", "spoken"].includes(q.status))
        .sort(byApprovedAt),
    [questions]
  );

  // 자동 사전 생성 파이프라인: 승인됐지만 답변 없는 질문을 승인 순으로 하나씩 생성
  useEffect(() => {
    if (genLockRef.current) {
      return;
    }
    const target = answerQueue.find(
      (q) => q.status === "approved" && !q.answerReady && !failedIds.has(q.id)
    );
    if (!target) {
      return;
    }
    genLockRef.current = true;
    setGeneratingId(target.id);
    generateAnswerText(target.text, target.nickname)
      .then((answer) => {
        if (!answer) {
          throw new Error("빈 답변");
        }
        return saveAnswer(target.id, answer);
      })
      .catch(() => {
        setFailedIds((prev) => new Set(prev).add(target.id));
        setError(`"${target.text.slice(0, 16)}…" 답변 생성 실패. 재시도할 수 있어요.`);
      })
      .finally(() => {
        setGeneratingId(null);
        genLockRef.current = false;
      });
  }, [answerQueue, failedIds]);

  // 무대가 상태를 보고하기 시작하면(준비/재생) 로컬 "전송 중" 표시를 해제한다
  useEffect(() => {
    if (!speakRequestedId || !control) {
      return;
    }
    if (control.nowPlayingId === speakRequestedId && control.stageStatus !== "idle") {
      setSpeakRequestedId(null);
    }
  }, [control, speakRequestedId]);

  const handleApprove = useCallback((id: string) => {
    approveQuestion(id).catch(() => setError("승인에 실패했습니다."));
  }, []);

  const handleDelete = useCallback((id: string) => {
    deleteQuestion(id).catch(() => setError("삭제에 실패했습니다."));
  }, []);

  const handleClearAll = useCallback(() => {
    if (!window.confirm("현재 모든 질문(닉네임·소속 포함)을 영구 삭제할까요? 세션(QR 주소)은 그대로 유지됩니다.")) {
      return;
    }
    clearAllQuestions().catch(() => setError("전체 삭제에 실패했습니다."));
  }, []);

  const handleSpeak = useCallback((id: string) => {
    // 클릭 즉시 로컬 피드백 → 무대가 상태를 보고하면(stageStatus) 그걸로 대체
    setSpeakRequestedId(id);
    requestSpeak(id).catch(() => {
      setSpeakRequestedId(null);
      setError("무대 재생 요청에 실패했습니다.");
    });
  }, []);

  const handleRetry = useCallback((id: string) => {
    setFailedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setError("");
  }, []);

  const handleReset = useCallback(() => {
    if (!window.confirm("현재 큐의 모든 질문(닉네임·소속 포함)을 영구 삭제하고 새 세션을 시작할까요? 무대도 초기화됩니다.")) {
      return;
    }
    resetSession()
      .then((id) => setSessionId(id))
      .catch(() => setError("세션 초기화에 실패했습니다."));
  }, []);

  if (!configured) {
    return (
      <main className="app-shell app-shell--operator">
        <div className="live-op-notice">Firebase 설정이 필요합니다. .env의 VITE_FIREBASE_* 값을 확인해 주세요.</div>
      </main>
    );
  }

  return (
    <main className="app-shell app-shell--operator">
      <header className="live-op-header">
        <div>
          <p className="panel-kicker">Live Operator</p>
          <h2>실시간 운영 콘솔</h2>
        </div>
        <div className="live-op-header__actions">
          <span className="live-op-stat">대기 {pending.length} · 큐 {answerQueue.length}</span>
          <a className="live-op-link" href="/stage" target="_blank" rel="noreferrer">
            무대 화면 열기 ↗
          </a>
          <button
            type="button"
            className="live-op-reset"
            onClick={handleClearAll}
            disabled={pending.length + answerQueue.length === 0}
          >
            전체 삭제
          </button>
          <button type="button" className="live-op-reset" onClick={handleReset}>
            세션 리셋
          </button>
        </div>
      </header>

      {error ? (
        <p className="live-op-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="live-op-grid">
        <section className="live-op-col">
          <div className="live-op-col__head">
            <h3>들어온 질문</h3>
            <span>{pending.length}</span>
          </div>
          <div className="live-op-list">
            {pending.length === 0 ? (
              <p className="live-op-empty">QR로 들어온 질문이 여기에 실시간으로 쌓여요.</p>
            ) : (
              pending.map((q) => (
                <article key={q.id} className="live-q-card">
                  <div className="live-q-meta">
                    <span className="live-q-badge">{q.affiliation}</span>
                    <span className="live-q-nick">{q.nickname}</span>
                  </div>
                  <p className="live-q-text">{q.text}</p>
                  <div className="live-q-actions">
                    <button type="button" className="live-btn live-btn--approve" onClick={() => handleApprove(q.id)}>
                      승인
                    </button>
                    <button type="button" className="live-btn live-btn--reject" onClick={() => handleDelete(q.id)}>
                      삭제
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="live-op-col">
          <div className="live-op-col__head">
            <h3>답변 큐 · 무대 송출</h3>
            <span>{answerQueue.length}</span>
          </div>
          <div className="live-op-list">
            {answerQueue.length === 0 ? (
              <p className="live-op-empty">질문을 승인하면 AI가 답변을 미리 만들어 둡니다.</p>
            ) : (
              answerQueue.map((q, index) => {
                const isNow = control?.nowPlayingId === q.id;
                const isGenerating = generatingId === q.id;
                const isFailed = failedIds.has(q.id);
                return (
                  <article
                    key={q.id}
                    className={`live-q-card live-q-card--queue ${isNow ? "live-q-card--now" : ""} ${
                      q.status === "spoken" ? "live-q-card--spoken" : ""
                    }`}
                  >
                    <div className="live-q-meta">
                      <span className="live-q-order">{index + 1}</span>
                      <span className="live-q-badge">{q.affiliation}</span>
                      <span className="live-q-nick">{q.nickname}</span>
                      {isNow && control?.stageStatus === "speaking" ? (
                        <span className="live-q-now">● 무대 송출 중</span>
                      ) : isNow && control?.stageStatus === "preparing" ? (
                        <span className="live-q-now live-q-now--preparing">⏳ 무대 준비 중</span>
                      ) : isNow && control?.stageStatus === "blocked" ? (
                        <span className="live-q-now live-q-now--blocked">🔇 무대 화면 클릭 필요</span>
                      ) : null}
                      {q.status === "spoken" ? <span className="live-q-done">완료</span> : null}
                    </div>
                    <p className="live-q-text">{q.text}</p>
                    {q.answerReady && q.answer ? (
                      <p className="live-q-answer">{q.answer}</p>
                    ) : isGenerating ? (
                      <p className="live-q-answer live-q-answer--pending">AI가 답변을 만드는 중…</p>
                    ) : isFailed ? (
                      <p className="live-q-answer live-q-answer--failed">답변 생성 실패</p>
                    ) : (
                      <p className="live-q-answer live-q-answer--pending">답변 대기 중…</p>
                    )}
                    <div className="live-q-actions">
                      {isFailed ? (
                        <button type="button" className="live-btn" onClick={() => handleRetry(q.id)}>
                          재시도
                        </button>
                      ) : (
                        (() => {
                          const isRequested = speakRequestedId === q.id;
                          const stageBusy =
                            isNow && (control?.stageStatus === "preparing" || control?.stageStatus === "speaking");
                          // 무대가 TTS 프리페치를 마쳐야(오디오 준비 완료) 재생 버튼이 열린다
                          const audioPending = q.answerReady && !q.audioReady;
                          const label = isRequested
                            ? "무대로 전송 중…"
                            : isNow && control?.stageStatus === "preparing"
                              ? "음성 준비 중…"
                              : isNow && control?.stageStatus === "speaking"
                                ? "재생 중…"
                                : audioPending
                                  ? "음성 준비 중…"
                                  : q.status === "spoken"
                                    ? "다시 말하기"
                                    : "무대에서 말하기";
                          return (
                            <button
                              type="button"
                              className={`live-btn live-btn--speak ${
                                isRequested || stageBusy || audioPending ? "live-btn--busy" : ""
                              }`}
                              onClick={() => handleSpeak(q.id)}
                              disabled={!q.answerReady || audioPending || isRequested || stageBusy}
                            >
                              {label}
                            </button>
                          );
                        })()
                      )}
                      <button type="button" className="live-btn live-btn--reject" onClick={() => handleDelete(q.id)}>
                        삭제
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
