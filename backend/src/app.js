const path = require("path");
const express = require("express");
const { env } = require("./config/env");
const { requestLogger } = require("./middleware/requestLogger");
const { healthRouter } = require("./routes/health");
const { messagesRouter } = require("./routes/messages");
const { webhookRouter } = require("./routes/webhook");
const { conversationsRouter } = require("./routes/conversations");
const { dashboardRouter } = require("./routes/dashboard");

const app = express();

if (env.nodeEnv === "production") {
  app.set("trust proxy", 1);
}

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
app.use("/api/conversations", conversationsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/webhook", webhookRouter);
app.use(express.static(path.join(__dirname, "../public")));

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
