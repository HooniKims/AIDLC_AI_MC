import { describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { bearerToken, verifyFirebaseIdToken } from "./firebaseAuth.mjs";

const PROJECT = "aidlc-ai-mc";

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// 테스트용 RSA 키쌍으로 유효한 Firebase 스타일 ID 토큰을 만든다
function makeToken({ privateKey, kid, claims }) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
  const payload = b64url(JSON.stringify(claims));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  const sig = b64url(signer.sign(privateKey));
  return `${header}.${payload}.${sig}`;
}

function fetchCerts(certPem, kid) {
  return vi.fn(async () => ({
    ok: true,
    headers: { get: () => "max-age=3600" },
    json: async () => ({ [kid]: certPem })
  }));
}

describe("firebaseAuth", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const certPem = publicKey.export({ type: "spki", format: "pem" });
  const kid = "test-kid";
  const now = Math.floor(Date.now() / 1000);
  const validClaims = {
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: "user-123",
    exp: now + 3600,
    iat: now
  };

  it("extracts bearer token from Authorization header", () => {
    expect(bearerToken({ headers: { authorization: "Bearer abc.def.ghi" } })).toBe("abc.def.ghi");
    expect(bearerToken({ headers: {} })).toBe("");
  });

  it("accepts a valid signed token", async () => {
    const token = makeToken({ privateKey, kid, claims: validClaims });
    const payload = await verifyFirebaseIdToken(token, PROJECT, fetchCerts(certPem, kid));
    expect(payload?.sub).toBe("user-123");
  });

  it("rejects an expired token", async () => {
    const token = makeToken({ privateKey, kid, claims: { ...validClaims, exp: now - 10 } });
    expect(await verifyFirebaseIdToken(token, PROJECT, fetchCerts(certPem, kid))).toBeNull();
  });

  it("rejects wrong audience (another Firebase project)", async () => {
    const token = makeToken({ privateKey, kid, claims: { ...validClaims, aud: "other-project" } });
    expect(await verifyFirebaseIdToken(token, PROJECT, fetchCerts(certPem, kid))).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const token = makeToken({ privateKey, kid, claims: validClaims });
    const tampered = token.slice(0, -4) + "AAAA";
    expect(await verifyFirebaseIdToken(tampered, PROJECT, fetchCerts(certPem, kid))).toBeNull();
  });

  it("rejects a token signed by an unknown key", async () => {
    const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const token = makeToken({ privateKey: other.privateKey, kid, claims: validClaims });
    expect(await verifyFirebaseIdToken(token, PROJECT, fetchCerts(certPem, kid))).toBeNull();
  });

  it("rejects empty/garbage tokens", async () => {
    const f = fetchCerts(certPem, kid);
    expect(await verifyFirebaseIdToken("", PROJECT, f)).toBeNull();
    expect(await verifyFirebaseIdToken("not-a-jwt", PROJECT, f)).toBeNull();
  });
});
