// 참가자 질문 입력 검증·비속어 필터 (순수 함수 — Firebase 없이 테스트 가능)

export const affiliations = [
  "교원",
  "교육전문직",
  "예비교원",
  "학부모",
  "학생",
  "일반"
] as const;

export type Affiliation = (typeof affiliations)[number];

export const questionMaxLength = 200;
export const nicknameMaxLength = 20;

// 명백한 한국어/영어 비속어만 최소한으로 차단한다. 과잉 차단은 피한다.
const profanityPatterns = [
  /시(발|팔|바)/,
  /씨(발|팔|바)/,
  /좆/,
  /병신/,
  /지랄/,
  /개새/,
  /새끼/,
  /엿먹/,
  /꺼져/,
  /닥쳐/,
  /fuck/i,
  /shit/i,
  /bitch/i,
  /asshole/i
];

export function containsProfanity(text: string): boolean {
  const normalized = text.replace(/\s+/g, "");
  return profanityPatterns.some((pattern) => pattern.test(normalized));
}

export interface QuestionValidationInput {
  text: string;
  nickname: string;
  affiliation: string;
}

export interface QuestionValidationResult {
  ok: boolean;
  error?: string;
  cleaned?: {
    text: string;
    nickname: string;
    affiliation: Affiliation;
  };
}

export function validateQuestion(input: QuestionValidationInput): QuestionValidationResult {
  const text = input.text.trim().replace(/\s+/g, " ");
  const nickname = input.nickname.trim().replace(/\s+/g, " ");
  const affiliation = input.affiliation as Affiliation;

  if (!text) {
    return { ok: false, error: "질문을 입력해 주세요." };
  }
  if (text.length < 4) {
    return { ok: false, error: "질문이 너무 짧아요. 조금 더 자세히 적어주세요." };
  }
  if (text.length > questionMaxLength) {
    return { ok: false, error: `질문은 ${questionMaxLength}자 이내로 입력해 주세요.` };
  }
  if (!nickname) {
    return { ok: false, error: "닉네임을 입력해 주세요." };
  }
  if (nickname.length > nicknameMaxLength) {
    return { ok: false, error: `닉네임은 ${nicknameMaxLength}자 이내로 입력해 주세요.` };
  }
  if (!affiliations.includes(affiliation)) {
    return { ok: false, error: "소속을 선택해 주세요." };
  }
  if (containsProfanity(text) || containsProfanity(nickname)) {
    return { ok: false, error: "부적절한 표현이 포함되어 있어요. 다시 작성해 주세요." };
  }

  return { ok: true, cleaned: { text, nickname, affiliation } };
}
