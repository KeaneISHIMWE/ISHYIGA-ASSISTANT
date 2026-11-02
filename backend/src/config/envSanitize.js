function stripBom(value) {
  return String(value || "").replace(/^\uFEFF/, "");
}

function sanitizeUrl(value) {
  return stripBom(value).trim();
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
