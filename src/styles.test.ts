import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("stage robot styling", () => {
  it("draws only a mouth overlay, not a separate face overlay", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "styles.css"), "utf8");
    const mouthRule = css.match(/\.robot-mouth\s*\{(?<body>[^}]+)\}/)?.groups?.body || "";

    expect(mouthRule).toContain("top: 51%");
    expect(mouthRule).toContain("left: 50%");
    expect(css).not.toMatch(/\.robot-face-frame\s*\{/);
  });
});
