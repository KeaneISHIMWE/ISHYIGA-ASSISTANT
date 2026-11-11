const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { detectLanguage, isSensitive, looksPersonal } = require("../src/services/aiStudio/language");
const { assessOtp, hashOtp, withinCooldown, OTP_TTL_MS } = require("../src/services/aiStudio/otp");

describe("AI Studio language", () => {
  it("detects a Kinyarwanda correction", () => {
    assert.equal(
      detectLanguage("Oya, umunyeshuri yiyandikisha muri Student Management"),
      "rw"
    );
  });

  it("keeps English corrections in English", () => {
    assert.equal(detectLanguage("Open Student Management, not Settings"), "en");
  });

  it("flags secrets and personal notes", () => {
    assert.equal(isSensitive("the password is 1234"), true);
    assert.equal(looksPersonal("My name is Alice"), true);
  });
});

describe("AI Studio OTP", () => {
  it("accepts a matching unexpired code once", () => {
    const pepper = "pepper";
    const record = {
      otp_hash: hashOtp("123456", pepper),
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      attempts: 0,
      verified_at: null,
    };
    assert.equal(assessOtp({ record, code: "123456", pepper }).ok, true);
    record.verified_at = new Date().toISOString();
    assert.equal(assessOtp({ record, code: "123456", pepper }).reason, "used");
  });

  it("rejects an expired or over-attempted code", () => {
    const pepper = "pepper";
    const record = {
      otp_hash: hashOtp("123456", pepper),
      expires_at: new Date(Date.now() - 1000).toISOString(),
      attempts: 0,
    };
    assert.equal(assessOtp({ record, code: "123456", pepper }).reason, "expired");
    record.expires_at = new Date(Date.now() + 1000).toISOString();
    record.attempts = 5;
    assert.equal(assessOtp({ record, code: "123456", pepper }).reason, "locked");
  });

  it("enforces the resend cooldown", () => {
    assert.equal(withinCooldown(new Date().toISOString()), true);
    assert.equal(withinCooldown(new Date(Date.now() - 120000).toISOString()), false);
  });
});
