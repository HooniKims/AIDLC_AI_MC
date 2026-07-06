import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type Auth
} from "firebase/auth";
import { getFirebaseApp } from "./firebase";

// 운영자 인증: /operator·/stage는 Firebase 이메일/비밀번호 로그인이 필요하다.
// Firestore 규칙이 질문 상태 변경·무대 제어 쓰기를 request.auth로 검사한다.
// 로그인 상태는 Firebase 기본 persistence(localStorage)로 새로고침에도 유지된다.

function auth(): Auth {
  return getAuth(getFirebaseApp());
}

export type OperatorAuthState = "loading" | "signed-in" | "signed-out";

export function watchOperatorAuth(callback: (state: OperatorAuthState) => void): () => void {
  return onAuthStateChanged(auth(), (user) => {
    callback(user ? "signed-in" : "signed-out");
  });
}

export async function signInOperator(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth(), email.trim(), password);
}

export async function signOutOperator(): Promise<void> {
  await signOut(auth());
}

// 현재 로그인한 운영자의 Firebase ID 토큰. 비용 유발 API 호출 시 Bearer로 첨부한다.
export async function currentIdToken(): Promise<string | null> {
  const user = auth().currentUser;
  if (!user) {
    return null;
  }
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

// ID 토큰을 Authorization 헤더에 실어 fetch한다 (스태프 전용 API용).
export async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = await currentIdToken();
  const headers = new Headers(init.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}
