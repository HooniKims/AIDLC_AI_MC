import { useEffect, useRef, useState } from "react";
import { ensureControl, submitQuestion } from "../lib/liveQueue";
import { isFirebaseConfigured } from "../lib/firebase";
import {
  affiliations,
  nicknameMaxLength,
  questionMaxLength,
  validateQuestion,
  type Affiliation
} from "../lib/questionModeration";

type Phase = "form" | "submitting" | "success";

const nicknameStorageKey = "ai-mc-ask-nickname";
const affiliationStorageKey = "ai-mc-ask-affiliation";

function readStored(key: string, fallback: string) {
  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export function AskPage() {
  const [nickname, setNickname] = useState(() => readStored(nicknameStorageKey, ""));
  const [affiliation, setAffiliation] = useState<Affiliation | "">(
    () => (readStored(affiliationStorageKey, "") as Affiliation) || ""
  );
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState("");
  const sessionIdRef = useRef<string | null>(null);
  const configured = isFirebaseConfigured();

  useEffect(() => {
    if (!configured) {
      return;
    }
    // 현재 세션 ID를 미리 확보(없으면 생성). 제출 지연을 줄인다.
    ensureControl()
      .then((sessionId) => {
        sessionIdRef.current = sessionId;
      })
      .catch(() => {
        // 제출 시점에 재시도한다.
      });
  }, [configured]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (phase === "submitting") {
      return;
    }

    const validation = validateQuestion({ text, nickname, affiliation: String(affiliation) });
    if (!validation.ok || !validation.cleaned) {
      setError(validation.error || "입력을 확인해 주세요.");
      return;
    }

    setError("");
    setPhase("submitting");
    try {
      const sessionId = sessionIdRef.current || (await ensureControl());
      sessionIdRef.current = sessionId;
      await submitQuestion({ sessionId, ...validation.cleaned });
      try {
        window.localStorage.setItem(nicknameStorageKey, validation.cleaned.nickname);
        window.localStorage.setItem(affiliationStorageKey, validation.cleaned.affiliation);
      } catch {
        // localStorage 불가 환경 무시
      }
      setPhase("success");
    } catch {
      setError("질문 전송에 실패했어요. 네트워크를 확인하고 다시 시도해 주세요.");
      setPhase("form");
    }
  }

  function askAnother() {
    setText("");
    setError("");
    setPhase("form");
  }

  if (!configured) {
    return (
      <main className="ask-screen">
        <div className="ask-card">
          <h1 className="ask-title">준비 중이에요</h1>
          <p className="ask-desc">질문 접수 시스템이 아직 설정되지 않았어요. 잠시 후 다시 시도해 주세요.</p>
        </div>
      </main>
    );
  }

  if (phase === "success") {
    return (
      <main className="ask-screen">
        <div className="ask-card ask-card--success">
          <div className="ask-success-badge" aria-hidden="true">
            ✓
          </div>
          <h1 className="ask-title">질문이 전달됐어요!</h1>
          <p className="ask-desc">
            AI MC가 무대에서 골라 답변할 거예요. 화면을 지켜봐 주세요!
          </p>
          <button type="button" className="ask-submit" onClick={askAnother}>
            질문 더 하기
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="ask-screen">
      <form className="ask-card" onSubmit={handleSubmit}>
        <p className="ask-kicker">2026 AI·디지털 러닝 콘페스타</p>
        <h1 className="ask-title">AI MC에게 질문하기</h1>
        <p className="ask-desc">궁금한 걸 남기면 AI MC가 무대에서 답해드려요.</p>

        <label className="ask-field">
          <span>닉네임</span>
          <input
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="예) 김선생"
            maxLength={nicknameMaxLength}
            inputMode="text"
            aria-label="닉네임"
          />
        </label>

        <label className="ask-field">
          <span>소속</span>
          <select
            value={affiliation}
            onChange={(event) => setAffiliation(event.target.value as Affiliation)}
            aria-label="소속"
          >
            <option value="" disabled>
              소속을 선택해 주세요
            </option>
            {affiliations.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="ask-field">
          <span>
            질문 <em className="ask-counter">{text.length}/{questionMaxLength}</em>
          </span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, questionMaxLength))}
            placeholder="AI MC에게 묻고 싶은 것을 적어주세요"
            rows={4}
            aria-label="질문 내용"
          />
        </label>

        {error ? (
          <p className="ask-error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="ask-submit" disabled={phase === "submitting"}>
          {phase === "submitting" ? "전송 중…" : "질문 보내기"}
        </button>
      </form>
    </main>
  );
}
