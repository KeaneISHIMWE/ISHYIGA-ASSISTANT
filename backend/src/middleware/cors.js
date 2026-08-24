const PUBLIC_READ_PREFIXES = [
  "/api/conversations",
  "/api/dashboard",
  "/api/openapi.json",
  "/api/health",
];

function isPublicReadPath(path) {
  return PUBLIC_READ_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

function allowPublicReadCors(req, res, next) {
  if (!isPublicReadPath(req.path)) {
    return next();
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  return next();
}

module.exports = {
  allowPublicReadCors,
  isPublicReadPath,
};
