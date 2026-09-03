const express = require("express");
const {
  listConversations,
  getConversation,
  getConversationByPhone,
} = require("../controllers/conversationsController");
const { requireConversationsAuth } = require("../middleware/conversationsAuth");

const conversationsRouter = express.Router();

conversationsRouter.use(requireConversationsAuth);
conversationsRouter.get("/", listConversations);
conversationsRouter.get("/by-phone", getConversationByPhone);
conversationsRouter.get("/:id", getConversation);

module.exports = { conversationsRouter };
