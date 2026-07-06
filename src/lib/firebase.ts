import { initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

// Firebase 웹 config는 클라이언트에 공개돼도 되는 값이다(보안은 Firestore 규칙으로 처리).
// Vite가 VITE_ 접두사 변수만 클라이언트 번들에 노출한다.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

let cachedApp: FirebaseApp | null = null;
let cachedDb: Firestore | null = null;

export function getDb(): Firestore {
  if (!isFirebaseConfigured()) {
    throw new Error(
      "Firebase 설정이 없습니다. .env에 VITE_FIREBASE_* 값을 입력해 주세요."
    );
  }
  if (!cachedApp) {
    cachedApp = initializeApp(firebaseConfig);
  }
  if (!cachedDb) {
    cachedDb = getFirestore(cachedApp);
  }
  return cachedDb;
}
