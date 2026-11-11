const KINYARWANDA_MARKERS =
  /\b(oya|ntabwo|ari|muri|kujya|umunyeshuri|ibyo|byo|ugomba|ntabwo|cyangwa|murakoze|yego|oya)\b/i;

const SENSITIVE_PATTERN =
  /\b(password|passwd|secret|token|api[_ -]?key|otp|pin|tin|credit card|ssn)\b/i;

const PERSONAL_PATTERN =
  /\b(my name is|call me|i prefer|i like|my phone|my email|remember that i)\b/i;

function detectLanguage(text) {
  const value = String(text || "");
  if (KINYARWANDA_MARKERS.test(value)) {
    return "rw";
  }
  return "en";
}

function isSensitive(text) {
  return SENSITIVE_PATTERN.test(String(text || ""));
}

function looksPersonal(text) {
  return PERSONAL_PATTERN.test(String(text || ""));
}

function fallbackNormalization(text) {
  const original = String(text || "").trim();
  const language = detectLanguage(original);
  if (language !== "rw") {
    return {
      language,
      normalizedEnglish: original,
      title: original.slice(0, 80) || "Correction",
    };
  }
  return {
    language,
    normalizedEnglish: original,
    title: "Kinyarwanda correction",
    needsModel: true,
  };
}

module.exports = {
  detectLanguage,
  isSensitive,
  looksPersonal,
  fallbackNormalization,
};
