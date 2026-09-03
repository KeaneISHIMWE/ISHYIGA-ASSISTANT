const express = require("express");
const {
  createMessage,
  describeMessageApi,
} = require("../controllers/messagesController");
const { requireConversationsAuth } = require("../middleware/conversationsAuth");

const messagesRouter = express.Router();

messagesRouter.get("/", describeMessageApi);
messagesRouter.use(requireConversationsAuth);
messagesRouter.post("/", createMessage);

module.exports = { messagesRouter };
