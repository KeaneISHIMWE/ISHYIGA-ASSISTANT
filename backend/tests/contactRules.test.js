const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { toCanonicalWhatsappDigits } = require("../src/services/contactRules");

describe("toCanonicalWhatsappDigits", () => {
  it("normalizes local and international Rwanda numbers", () => {
    assert.equal(toCanonicalWhatsappDigits("+250788880066"), "250788880066");
    assert.equal(toCanonicalWhatsappDigits("0788880066"), "250788880066");
    assert.equal(toCanonicalWhatsappDigits("788880066"), "250788880066");
    assert.equal(toCanonicalWhatsappDigits("250788880066"), "250788880066");
  });

  it("returns an empty string when no digits are present", () => {
    assert.equal(toCanonicalWhatsappDigits(""), "");
    assert.equal(toCanonicalWhatsappDigits("abc"), "");
  });
});
