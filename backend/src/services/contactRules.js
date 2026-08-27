function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function toCanonicalWhatsappDigits(value) {
  const digits = digitsOnly(value);
  if (!digits) {
    return "";
  }

  if (digits.startsWith("250") && digits.length >= 12) {
    return digits.slice(0, 12);
  }

  if (digits.startsWith("0") && digits.length === 10) {
    return `250${digits.slice(1)}`;
  }

  if (digits.length === 9 && digits.startsWith("7")) {
    return `250${digits}`;
  }

  return digits;
}

module.exports = {
  toCanonicalWhatsappDigits,
};
