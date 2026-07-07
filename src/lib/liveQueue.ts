import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
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
  // 무대가 TTS 오디오 프리페치를 마쳤는지 (완료 전엔 운영 콘솔 재생 버튼 잠금)
  audioReady: boolean;
}

export interface LiveControl {
  sessionId: string;
  nowPlayingId: string | null;
  speakNonce: number;
  // 무대 재생 상태: 운영 콘솔이 "클릭이 먹혔는지"를 실시간으로 보여주기 위한 값
  stageStatus: StageStatus;
  // 무대 화면이 살아있음을 알리는 하트비트(ms). 운영 콘솔이 무대 연결 여부를 판단.
  stageHeartbeat: number;
}

export type StageStatus = "idle" | "preparing" | "speaking" | "blocked";

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
    answerReady: Boolean(data.answerReady),
    audioReady: Boolean(data.audioReady)
  };
}

function controlRef() {
  return doc(getDb(), CONTROL_DOC);
}

// 참가자용: 현재 sessionId를 읽기만 한다 (쓰기 권한 불필요).
// 운영자가 아직 콘솔을 연 적 없어 제어 문서가 없으면 null.
export async function readSessionId(): Promise<string | null> {
  const snapshot = await getDoc(controlRef());
  if (!snapshot.exists()) {
    return null;
  }
  return String(snapshot.data().sessionId ?? "") || null;
}

// 운영자·무대용: 제어 문서(현재 세션·재생 상태)를 없으면 생성한다. 반환은 현재 sessionId.
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
      speakNonce: Number(data.speakNonce ?? 0),
      stageStatus: (data.stageStatus ?? "idle") as StageStatus,
      stageHeartbeat: data.stageHeartbeat instanceof Timestamp ? data.stageHeartbeat.toMillis() : 0
    });
  });
}

// 무대가 자신의 재생 상태를 보고한다 (운영 콘솔 실시간 피드백용). 실패는 무시해도 무방.
export async function reportStageStatus(status: StageStatus): Promise<void> {
  await updateDoc(controlRef(), {
    stageStatus: status,
    stageHeartbeat: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

// 무대 화면이 살아있음을 주기적으로 알린다(하트비트).
export async function reportStageHeartbeat(): Promise<void> {
  await updateDoc(controlRef(), { stageHeartbeat: serverTimestamp() });
}

// 세션의 모든 질문 문서를 삭제한다 (닉네임·소속 등 개인정보 정리용).
async function deleteAllQuestions(): Promise<number> {
  const snapshot = await getDocs(collection(getDb(), QUESTIONS));
  let deleted = 0;
  const docs = snapshot.docs;
  // Firestore 배치 한도(500) 단위로 나눠 삭제
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(getDb());
    for (const docSnap of docs.slice(i, i + 400)) {
      batch.delete(docSnap.ref);
      deleted += 1;
    }
    await batch.commit();
  }
  return deleted;
}

// 새 세션으로 초기화하고, 개인정보(참가자 질문)를 즉시 삭제한다.
// 행사 종료·리허설 종료 시 개인정보를 남기지 않기 위한 경로.
export async function resetSession(): Promise<string> {
  await deleteAllQuestions();
  const sessionId = `s-${Date.now()}`;
  await setDoc(controlRef(), {
    sessionId,
    nowPlayingId: null,
    speakNonce: 0,
    updatedAt: serverTimestamp()
  });
  return sessionId;
}

// 단일 질문 삭제 (운영자가 개별 항목을 완전히 지울 때).
export async function deleteQuestion(id: string): Promise<void> {
  await deleteDoc(doc(getDb(), QUESTIONS, id));
}

// 세션은 유지하고 질문(개인정보)만 전부 삭제. 세션 리셋과 달리 새 세션을 열지 않아,
// 참가자 QR 주소가 그대로 유지되면서 큐만 비운다.
export async function clearAllQuestions(): Promise<number> {
  return deleteAllQuestions();
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
    answerReady: false,
    audioReady: false
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

// 무대가 해당 질문의 TTS 오디오 프리페치를 마쳤음을 보고한다.
export async function markAudioReady(id: string): Promise<void> {
  await updateDoc(questionRef(id), { audioReady: true });
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
