const { createHash, randomInt, timingSafeEqual } = require("node:crypto");

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

function hashOtp(code, pepper) {
  return createHash("sha256")
    .update(`${pepper}:${String(code)}`)
    .digest("hex");
}

function otpMatches(code, storedHash, pepper) {
  const actual = Buffer.from(hashOtp(code, pepper));
  const expected = Buffer.from(String(storedHash || ""), "utf8");
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

function createOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function assessOtp({ record, now = Date.now(), code, pepper }) {
  if (!record) {
    return { ok: false, reason: "invalid" };
  }
  if (record.verified_at) {
    return { ok: false, reason: "used" };
  }
  if (new Date(record.expires_at).getTime() <= now) {
    return { ok: false, reason: "expired" };
  }
  if (Number(record.attempts) >= MAX_ATTEMPTS) {
    return { ok: false, reason: "locked" };
  }
  if (!otpMatches(code, record.otp_hash, pepper)) {
    return { ok: false, reason: "invalid", increment: true };
  }
  return { ok: true };
}

function withinCooldown(createdAt, now = Date.now()) {
  if (!createdAt) {
    return false;
  }
  return now - new Date(createdAt).getTime() < RESEND_COOLDOWN_MS;
}

module.exports = {
  OTP_TTL_MS,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  hashOtp,
  createOtpCode,
  assessOtp,
  withinCooldown,
};
