const express = require("express");
const {
  listConversations,
  getConversation,
} = require("../controllers/conversationsController");
const { requireConversationsAuth } = require("../middleware/conversationsAuth");

const conversationsRouter = express.Router();

conversationsRouter.use(requireConversationsAuth);
conversationsRouter.get("/", listConversations);
conversationsRouter.get("/:id", getConversation);

module.exports = { conversationsRouter };
