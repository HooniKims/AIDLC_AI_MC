export type RobotState = "idle" | "listening" | "thinking" | "speaking";

export type QuestionStatus = "queued" | "selected" | "answered";

export interface AudienceQuestion {
  id: string;
  text: string;
  author: string;
  status: QuestionStatus;
}

export interface McSession {
  selectedQuestion: AudienceQuestion | null;
  draftAnswer: string;
  approvedAnswer: string;
  robotState: RobotState;
  error: string;
}
