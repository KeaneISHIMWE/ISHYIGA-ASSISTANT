function stripBom(value) {
  return String(value || "").replace(/^\uFEFF/, "");
}

function sanitizeUrl(value) {
  const cleaned = stripBom(value).trim();
  const match = cleaned.match(/https?:\/\/[^\s"'<>]+/i);
  if (match) {
    return match[0];
  }
  return cleaned.replace(/[^\x21-\x7E]/g, "").trim();
}

function sanitizeSecret(value) {
  return stripBom(value)
    .trim()
    .replace(/[^\x21-\x7E]/g, "");
}

module.exports = {
  sanitizeSecret,
  sanitizeUrl,
};
