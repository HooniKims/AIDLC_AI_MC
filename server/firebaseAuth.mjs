import crypto from "node:crypto";

// Firebase ID 토큰(RS256 JWT)을 서비스 계정 키 없이 오프라인 검증한다.
// Google 공개 인증서로 서명을 확인하고 iss/aud/exp 클레임을 검사한다.
// 비용이 드는 API(/api/generate-answer, /api/tts)를 로그인한 스태프로 제한하는 용도.

const CERT_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let certCache = { certs: null, expiresAt: 0 };

async function getGoogleCerts(fetchImpl) {
  const now = Date.now();
  if (certCache.certs && now < certCache.expiresAt) {
    return certCache.certs;
  }
  const response = await fetchImpl(CERT_URL);
  if (!response.ok) {
    throw new Error("Google 공개 인증서를 가져오지 못했습니다.");
  }
  const certs = await response.json();
  // Cache-Control max-age를 존중하되 최소 10분은 캐시
  const cacheControl = response.headers?.get?.("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 3600_000;
  certCache = { certs, expiresAt: now + Math.max(maxAgeMs, 600_000) };
  return certs;
}

function base64UrlDecode(input) {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function base64UrlToJson(input) {
  return JSON.parse(base64UrlDecode(input).toString("utf8"));
}

// 검증 성공 시 payload(디코드된 클레임), 실패 시 null 반환.
export async function verifyFirebaseIdToken(idToken, projectId, fetchImpl) {
  if (!idToken || typeof idToken !== "string" || !projectId) {
    return null;
  }

  const parts = idToken.split(".");
  if (parts.length !== 3) {
    return null;
  }

  let header;
  let payload;
  try {
    header = base64UrlToJson(parts[0]);
    payload = base64UrlToJson(parts[1]);
  } catch {
    return null;
  }

  if (header.alg !== "RS256" || !header.kid) {
    return null;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < nowSec) {
    return null;
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    return null;
  }
  if (payload.aud !== projectId) {
    return null;
  }
  if (!payload.sub) {
    return null;
  }

  let certs;
  try {
    certs = await getGoogleCerts(fetchImpl);
  } catch {
    return null;
  }
  const cert = certs[header.kid];
  if (!cert) {
    return null;
  }

  try {
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();
    const ok = verifier.verify(cert, base64UrlDecode(parts[2]));
    return ok ? payload : null;
  } catch {
    return null;
  }
}

export function bearerToken(request) {
  const header = request.headers?.authorization || request.headers?.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(header));
  return match ? match[1].trim() : "";
}
