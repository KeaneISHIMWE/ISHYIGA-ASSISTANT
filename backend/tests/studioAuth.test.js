const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  readCookie,
  hitRateLimit,
  resetRateLimits,
} = require("../src/services/studioAuth");

describe("studio passwords and sessions", () => {
  it("hashes passwords and rejects the wrong one", () => {
    const stored = hashPassword("correct-horse");
    assert.equal(verifyPassword("correct-horse", stored), true);
    assert.equal(verifyPassword("wrong-horse", stored), false);
    assert.equal(stored.includes("correct-horse"), false);
  });

  it("accepts a signed token and rejects a tampered one", () => {
    const token = signToken({ sub: "user-1", role: "CONTRIBUTOR" }, "test-secret");
    assert.equal(verifyToken(token, "test-secret").sub, "user-1");
    assert.equal(verifyToken(`${token}x`, "test-secret"), null);
    assert.equal(verifyToken(token, "test-secret", Date.now() + 8 * 24 * 60 * 60 * 1000), null);
    assert.equal(readCookie("a=1; studio_token=abc", "studio_token"), "abc");
  });

  it("limits repeated sign-in attempts", () => {
    resetRateLimits();
    for (let index = 0; index < 8; index += 1) {
      assert.equal(hitRateLimit("login:test", { limit: 8, windowMs: 1000, now: 1 }), false);
    }
    assert.equal(hitRateLimit("login:test", { limit: 8, windowMs: 1000, now: 1 }), true);
    resetRateLimits();
  });
});
