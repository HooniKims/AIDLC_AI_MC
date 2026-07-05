import type { AudienceQuestion } from "../types";

export const sampleQuestions: AudienceQuestion[] = [
  {
    id: "q-location",
    text: "행사 장소와 일정이 어떻게 되나요?",
    author: "현장 참가자",
    status: "queued"
  },
  {
    id: "q-program",
    text: "교사가 가장 먼저 둘러보면 좋은 프로그램은 무엇인가요?",
    author: "초등 교사",
    status: "queued"
  },
  {
    id: "q-parent",
    text: "학부모도 참여할 수 있는 프로그램이 있나요?",
    author: "학부모",
    status: "queued"
  },
  {
    id: "q-ai-class",
    text: "AI를 수업에 활용할 때 가장 중요한 점은 무엇인가요?",
    author: "예비교원",
    status: "queued"
  },
  {
    id: "q-identity",
    text: "AI MC님, 자기소개 부탁해요!",
    author: "운영 리허설",
    status: "queued"
  }
];
