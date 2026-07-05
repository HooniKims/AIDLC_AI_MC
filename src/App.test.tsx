import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  render(<App />);
}

describe("App routes", () => {
  it("renders the internal demo screen", () => {
    renderAt("/demo");
    expect(screen.getByText("AI MC 리허설")).toBeInTheDocument();
  });

  it("renders the event stage screen", () => {
    renderAt("/stage");
    expect(screen.getByText("AI MC")).toBeInTheDocument();
  });

  it("renders the operator console", () => {
    renderAt("/operator");
    expect(screen.getByText("운영자 콘솔")).toBeInTheDocument();
  });
});
