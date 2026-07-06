import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentData
} from "firebase/firestore";
import { getDb } from "./firebase";
import type { Affiliation } from "./questionModeration";

export type QuestionStatus = "pending" | "approved" | "answered" | "spoken" | "rejected";

export interface LiveQuestion {
  id: string;
  sessionId: string;
  text: string;
  nickname: string;
  affiliation: Affiliation;
  status: QuestionStatus;
  createdAt: number;
  approvedAt: number | null;
  answer: string | null;
  answerReady: boolean;
}

export interface LiveControl {
  sessionId: string;
  nowPlayingId: string | null;
  speakNonce: number;
}

const QUESTIONS = "questions";
const CONTROL_DOC = "control/live";

function toMillis(value: unknown): number {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }
  return 0;
}

function mapQuestion(id: string, data: DocumentData): LiveQuestion {
  return {
    id,
    sessionId: String(data.sessionId ?? ""),
    text: String(data.text ?? ""),
    nickname: String(data.nickname ?? ""),
    affiliation: (data.affiliation ?? "일반") as Affiliation,
    status: (data.status ?? "pending") as QuestionStatus,
    createdAt: toMillis(data.createdAt),
    approvedAt: data.approvedAt ? toMillis(data.approvedAt) : null,
    answer: data.answer ? String(data.answer) : null,
    answerReady: Boolean(data.answerReady)
  };
}

function controlRef() {
  return doc(getDb(), CONTROL_DOC);
}

// 제어 문서(현재 세션·재생 상태)를 없으면 생성한다. 반환은 현재 sessionId.
export async function ensureControl(): Promise<string> {
  const ref = controlRef();
  const snapshot = await getDoc(ref);
  if (snapshot.exists()) {
    return String(snapshot.data().sessionId ?? "");
  }
  const sessionId = `s-${Date.now()}`;
  await setDoc(ref, { sessionId, nowPlayingId: null, speakNonce: 0, updatedAt: serverTimestamp() });
  return sessionId;
}

export function watchControl(callback: (control: LiveControl | null) => void): () => void {
  return onSnapshot(controlRef(), (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }
    const data = snapshot.data();
    callback({
      sessionId: String(data.sessionId ?? ""),
      nowPlayingId: data.nowPlayingId ? String(data.nowPlayingId) : null,
      speakNonce: Number(data.speakNonce ?? 0)
    });
  });
}

// 새 세션으로 초기화한다. 이전 질문은 sessionId가 달라져 큐에서 사라진다(데이터는 보존).
export async function resetSession(): Promise<string> {
  const sessionId = `s-${Date.now()}`;
  await setDoc(controlRef(), {
    sessionId,
    nowPlayingId: null,
    speakNonce: 0,
    updatedAt: serverTimestamp()
  });
  return sessionId;
}

export interface QuestionSubmission {
  sessionId: string;
  text: string;
  nickname: string;
  affiliation: Affiliation;
}

export async function submitQuestion(submission: QuestionSubmission): Promise<void> {
  await addDoc(collection(getDb(), QUESTIONS), {
    sessionId: submission.sessionId,
    text: submission.text,
    nickname: submission.nickname,
    affiliation: submission.affiliation,
    status: "pending" as QuestionStatus,
    createdAt: serverTimestamp(),
    approvedAt: null,
    answer: null,
    answerReady: false
  });
}

export function watchSessionQuestions(
  sessionId: string,
  callback: (questions: LiveQuestion[]) => void
): () => void {
  // 복합 인덱스를 피하려고 orderBy 없이 sessionId로만 필터하고 클라이언트에서 정렬한다.
  // 현장 질문 수(수백 건 이하) 규모에서 충분하며 별도 Firestore 인덱스 설정이 불필요하다.
  const q = query(collection(getDb(), QUESTIONS), where("sessionId", "==", sessionId));
  return onSnapshot(q, (snapshot) => {
    const questions = snapshot.docs
      .map((docSnap) => mapQuestion(docSnap.id, docSnap.data()))
      .sort((a, b) => a.createdAt - b.createdAt);
    callback(questions);
  });
}

function questionRef(id: string) {
  return doc(getDb(), QUESTIONS, id);
}

export async function approveQuestion(id: string): Promise<void> {
  await updateDoc(questionRef(id), { status: "approved", approvedAt: serverTimestamp() });
}

export async function rejectQuestion(id: string): Promise<void> {
  await updateDoc(questionRef(id), { status: "rejected" });
}

export async function saveAnswer(id: string, answer: string): Promise<void> {
  await updateDoc(questionRef(id), { answer, answerReady: true, status: "answered" });
}

// 무대에서 해당 질문을 말하도록 제어 상태를 갱신한다(speakNonce 증가로 재트리거).
export async function requestSpeak(id: string): Promise<void> {
  await updateDoc(controlRef(), {
    nowPlayingId: id,
    speakNonce: increment(1),
    updatedAt: serverTimestamp()
  });
}

export async function markSpoken(id: string): Promise<void> {
  await updateDoc(questionRef(id), { status: "spoken" });
}

export async function clearNowPlaying(): Promise<void> {
  await updateDoc(controlRef(), { nowPlayingId: null, updatedAt: serverTimestamp() });
}
