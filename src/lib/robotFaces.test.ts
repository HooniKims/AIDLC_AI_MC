import { describe, expect, it } from "vitest";
import { faceForFrame, faceTextureUrls, speakingFaceCount } from "./robotFaces";

describe("robotFaces", () => {
  it("maps six speaking lip frames onto screen face cuts", () => {
    expect(speakingFaceCount).toBe(6);
    expect(faceForFrame("speaking", 0)).toBe("neutral");
    expect(faceForFrame("speaking", 1)).toBe("slight");
    expect(faceForFrame("speaking", 2)).toBe("open");
    expect(faceForFrame("speaking", 3)).toBe("surprised");
    expect(faceForFrame("speaking", 4)).toBe("smileOpen");
    expect(faceForFrame("speaking", 5)).toBe("slight");
  });

  it("wraps lip frames beyond the sequence length", () => {
    expect(faceForFrame("speaking", 6)).toBe(faceForFrame("speaking", 0));
    expect(faceForFrame("speaking", 8)).toBe(faceForFrame("speaking", 2));
    expect(faceForFrame("speaking", -1)).toBe(faceForFrame("speaking", 5));
  });

  it("keeps a smiling default face for non-speaking states", () => {
    expect(faceForFrame("idle", 3)).toBe("open");
    expect(faceForFrame("listening", 3)).toBe("open");
    expect(faceForFrame("thinking", 3)).toBe("slight");
  });

  it("prioritizes blinking over any state", () => {
    expect(faceForFrame("speaking", 2, true)).toBe("happyClosed");
    expect(faceForFrame("idle", 0, true)).toBe("happyClosed");
  });

  it("provides a texture url for every face cut", () => {
    Object.values(faceTextureUrls).forEach((url) => {
      expect(url).toMatch(/^\/faces\/face_[a-z_]+\.png$/);
    });
  });
});
