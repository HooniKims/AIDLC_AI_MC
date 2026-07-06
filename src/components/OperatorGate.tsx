import { useEffect, useState, type ReactNode } from "react";
import { isFirebaseConfigured } from "../lib/firebase";
import { signInOperator, watchOperatorAuth, type OperatorAuthState } from "../lib/operatorAuth";

interface OperatorGateProps {
  // 게이트 화면에 표시할 화면 이름 (예: "운영 콘솔", "무대 화면")
  screenName: string;
  children: ReactNode;
}

// 운영자 전용 화면 래퍼: 로그인 전에는 이메일/비밀번호 폼만 보여준다.
export function OperatorGate({ screenName, children }: OperatorGateProps) {
  const configured = isFirebaseConfigured();
  const [authState, setAuthState] = useState<OperatorAuthState>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!configured) {
      return;
    }
    return watchOperatorAuth(setAuthState);
  }, [configured]);

  if (!configured) {
    return (
      <main className="gate-screen">
        <div className="gate-card">Firebase 설정이 필요합니다. .env의 VITE_FIREBASE_* 값을 확인해 주세요.</div>
      </main>
    );
  }

  if (authState === "signed-in") {
    return <>{children}</>;
  }

  if (authState === "loading") {
    return (
      <main className="gate-screen">
        <div className="gate-card gate-card--pending">로그인 상태 확인 중…</div>
      </main>
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      // 한글 IME가 남긴 전각 문자·공백을 정규화해 로그인 실패를 막는다
      const cleanEmail = email.normalize("NFKC").replace(/\s+/g, "");
      await signInOperator(cleanEmail, password);
    } catch {
      setError("로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="gate-screen">
      <form className="gate-card" onSubmit={handleSubmit}>
        <p className="gate-kicker">Staff only</p>
        <h1 className="gate-title">{screenName} 로그인</h1>
        <label className="ask-field">
          <span>운영자 이메일</span>
          <input
            // type="email" 대신 text + inputMode로: 한글 IME/전각문자 때문에
            // 브라우저가 "@ 뒤에 기호" 오류로 막던 문제 방지. 실제 검증은 Firebase가 함.
            type="text"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="운영자 이메일"
          />
        </label>
        <label className="ask-field">
          <span>비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            aria-label="비밀번호"
          />
        </label>
        {error ? (
          <p className="ask-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="ask-submit" disabled={submitting}>
          {submitting ? "확인 중…" : "로그인"}
        </button>
      </form>
    </main>
  );
}
