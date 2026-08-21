const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  matchSpecialContactReply,
  SPECIAL_REPLY,
} = require("../src/services/contactRules");

describe("matchSpecialContactReply", () => {
  it("returns AIMABLE for the special contact and trigger", () => {
    assert.equal(
      matchSpecialContactReply({
        customerNumber: "+250788880066",
        message: "kimenyi",
      }),
      SPECIAL_REPLY
    );
    assert.equal(
      matchSpecialContactReply({
        customerNumber: "250788880066",
        message: "Please check KIMENYI now",
      }),
      SPECIAL_REPLY
    );
  });

  it("does not apply the rule for other contacts", () => {
    assert.equal(
      matchSpecialContactReply({
        customerNumber: "250734047817",
        message: "kimenyi",
      }),
      null
    );
  });

  it("does not apply the rule without the trigger word", () => {
    assert.equal(
      matchSpecialContactReply({
        customerNumber: "250788880066",
        message: "hello",
      }),
      null
    );
  });
});
