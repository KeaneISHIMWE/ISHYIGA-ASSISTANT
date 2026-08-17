function timestamp() {
  return new Date().toISOString();
}

function log(level, message, extra) {
  const entry = {
    time: timestamp(),
    level,
    message,
  };

  if (extra && typeof extra === "object") {
    entry.extra = extra;
  }

  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}

const logger = {
  info(message, extra) {
    log("info", message, extra);
  },
  warn(message, extra) {
    log("warn", message, extra);
  },
  error(message, extra) {
    log("error", message, extra);
  },
};

module.exports = { logger };
