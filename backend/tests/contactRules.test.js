const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  toCanonicalWhatsappDigits,
  phoneLookupCandidates,
} = require("../src/services/contactRules");

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

describe("phoneLookupCandidates", () => {
  it("includes local and international forms of a Rwanda number", () => {
    assert.deepEqual(phoneLookupCandidates("0781111111"), [
      "0781111111",
      "250781111111",
    ]);
    assert.deepEqual(phoneLookupCandidates("+250792431896"), [
      "250792431896",
      "0792431896",
    ]);
  });

  it("returns no candidates when the phone is empty", () => {
    assert.deepEqual(phoneLookupCandidates(""), []);
    assert.deepEqual(phoneLookupCandidates("abc"), []);
  });
});
