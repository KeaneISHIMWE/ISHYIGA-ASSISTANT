const express = require("express");
const { createMessage } = require("../controllers/messagesController");
const { requireConversationsAuth } = require("../middleware/conversationsAuth");

const messagesRouter = express.Router();

messagesRouter.use(requireConversationsAuth);
messagesRouter.post("/", createMessage);

module.exports = { messagesRouter };
