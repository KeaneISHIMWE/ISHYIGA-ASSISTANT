const express = require("express");
const { verify, receive } = require("../controllers/webhookController");

const webhookRouter = express.Router();

webhookRouter.get("/", verify);
webhookRouter.post("/", receive);

module.exports = { webhookRouter };
