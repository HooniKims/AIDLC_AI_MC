import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("./components/Robot3D", () => ({
  Robot3D: () => <div className="robot-canvas" data-robot-3d="true" />
}));

// 라이브 화면은 Firebase에 붙지 않도록 데이터 계층을 모킹한다(라우팅·렌더만 검증).
vi.mock("./lib/firebase", () => ({
  isFirebaseConfigured: () => true,
  getDb: () => {
    throw new Error("not used in tests");
  }
}));

vi.mock("./lib/liveQueue", () => ({
  ensureControl: () => Promise.resolve("s-test"),
  watchControl: () => () => undefined,
  watchSessionQuestions: () => () => undefined,
  resetSession: () => Promise.resolve("s-test"),
  approveQuestion: () => Promise.resolve(),
  rejectQuestion: () => Promise.resolve(),
  saveAnswer: () => Promise.resolve(),
  requestSpeak: () => Promise.resolve(),
  markSpoken: () => Promise.resolve(),
  submitQuestion: () => Promise.resolve()
}));

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  render(<App />);
}

describe("App routes", () => {
  it("renders the internal demo screen", () => {
    renderAt("/demo");
    expect(screen.getByText("AI MC 리허설")).toBeInTheDocument();
  });

  it("renders the live event stage screen", () => {
    renderAt("/stage");
    expect(screen.getByText("AI MC")).toBeInTheDocument();
  });

  it("renders the live operator console", () => {
    renderAt("/operator");
    expect(screen.getByText("실시간 운영 콘솔")).toBeInTheDocument();
  });

  it("renders the participant ask page", () => {
    renderAt("/ask");
    expect(screen.getByText("AI MC에게 질문하기")).toBeInTheDocument();
  });
});
