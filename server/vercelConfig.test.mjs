import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("Vercel SPA routing config", () => {
  it("rewrites app routes to the client entrypoint without touching API routes", () => {
    const config = JSON.parse(fs.readFileSync(path.join(rootDir, "vercel.json"), "utf8"));
    const rewriteMap = new Map(config.rewrites.map((rewrite) => [rewrite.source, rewrite.destination]));

    expect(rewriteMap.get("/stage")).toBe("/index.html");
    expect(rewriteMap.get("/operator")).toBe("/index.html");
    expect(rewriteMap.get("/ask")).toBe("/index.html");
    // 리허설(/demo) 라우트는 제거됨
    expect(rewriteMap.has("/demo")).toBe(false);
    expect([...rewriteMap.keys()].some((source) => source.startsWith("/api"))).toBe(false);
  });
});
