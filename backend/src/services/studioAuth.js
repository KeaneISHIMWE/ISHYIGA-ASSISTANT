const { randomBytes, scryptSync, timingSafeEqual, createHmac } = require("node:crypto");

const KEY_LENGTH = 64;
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(password), salt, KEY_LENGTH).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }

  const expected = Buffer.from(parts[2], "hex");
  const actual = scryptSync(String(password), parts[1], KEY_LENGTH);
  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeJson(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function signToken(payload, secret, now = Date.now()) {
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const body = encodeJson({
    ...payload,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + TOKEN_TTL_SECONDS,
  });
  const signature = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verifyToken(token, secret, now = Date.now()) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || !secret) {
    return null;
  }

  const expected = createHmac("sha256", secret)
    .update(`${parts[0]}.${parts[1]}`)
    .digest("base64url");
  const actual = Buffer.from(parts[2]);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) {
    return null;
  }

  let payload;
  try {
    payload = decodeJson(parts[1]);
  } catch (_error) {
    return null;
  }

  if (!payload || typeof payload.exp !== "number" || payload.exp * 1000 <= now) {
    return null;
  }

  return payload;
}

function readCookie(header, name) {
  const source = String(header || "");
  const parts = source.split(";").map((part) => part.trim());
  const match = parts.find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

function cookieHeader(token, { secure = false, maxAge = TOKEN_TTL_SECONDS } = {}) {
  const pieces = [
    `studio_token=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) {
    pieces.push("Secure");
  }
  return pieces.join("; ");
}

const rateBuckets = new Map();

function hitRateLimit(key, { limit = 8, windowMs = 15 * 60 * 1000, now = Date.now() } = {}) {
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  current.count += 1;
  return current.count > limit;
}

function resetRateLimits() {
  rateBuckets.clear();
}

module.exports = {
  TOKEN_TTL_SECONDS,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  readCookie,
  cookieHeader,
  hitRateLimit,
  resetRateLimits,
};
