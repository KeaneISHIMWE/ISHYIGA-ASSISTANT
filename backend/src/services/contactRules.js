const SPECIAL_CONTACT_DIGITS = "250788880066";
const SPECIAL_TRIGGER = /kimenyi/i;
const SPECIAL_REPLY = "AIMABLE";

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function matchSpecialContactReply({ customerNumber, message } = {}) {
  const customer = digitsOnly(customerNumber);
  if (customer !== SPECIAL_CONTACT_DIGITS) {
    return null;
  }

  if (typeof message !== "string" || !SPECIAL_TRIGGER.test(message)) {
    return null;
  }

  return SPECIAL_REPLY;
}

module.exports = {
  matchSpecialContactReply,
  SPECIAL_CONTACT_DIGITS,
  SPECIAL_REPLY,
};
