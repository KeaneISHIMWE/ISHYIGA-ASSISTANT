function resolvePoolSsl(databaseUrl, nodeEnv) {
  const url = String(databaseUrl || "");

  if (/[?&]sslmode=disable(?:&|$)/i.test(url)) {
    return false;
  }

  const needsSsl =
    nodeEnv === "production" ||
    /neon\.tech/i.test(url) ||
    /[?&]sslmode=(?:require|verify-ca|verify-full)(?:&|$)/i.test(url);

  if (!needsSsl) {
    return undefined;
  }

  return { rejectUnauthorized: true };
}

module.exports = { resolvePoolSsl };
