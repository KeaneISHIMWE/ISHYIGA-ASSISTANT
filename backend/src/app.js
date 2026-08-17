const express = require("express");
const { requestLogger } = require("./middleware/requestLogger");
const { healthRouter } = require("./routes/health");
const { messagesRouter } = require("./routes/messages");
const { webhookRouter } = require("./routes/webhook");

const app = express();

app.use(
  express.json({
    verify: (req, _res, buffer) => {
      req.rawBody = buffer;
    },
  })
);
app.use(requestLogger);

app.use("/api/health", healthRouter);
app.use("/api/messages", messagesRouter);
app.use("/webhook", webhookRouter);

app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    path: req.originalUrl,
  });
});

app.use((err, _req, res, _next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: "Internal server error",
  });
});

module.exports = { app };
