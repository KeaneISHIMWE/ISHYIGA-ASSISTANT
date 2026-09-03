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

function phoneLookupCandidates(value) {
  const raw = digitsOnly(value);
  const canonical = toCanonicalWhatsappDigits(value);
  const candidates = [];

  const add = (item) => {
    if (item && !candidates.includes(item)) {
      candidates.push(item);
    }
  };

  add(raw);
  add(canonical);

  if (canonical.startsWith("250") && canonical.length === 12) {
    add(`0${canonical.slice(3)}`);
  }

  return candidates;
}

module.exports = {
  toCanonicalWhatsappDigits,
  phoneLookupCandidates,
};
