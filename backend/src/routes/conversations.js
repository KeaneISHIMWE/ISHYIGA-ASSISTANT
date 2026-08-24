const express = require("express");
const {
  listConversations,
  getConversation,
} = require("../controllers/conversationsController");

const conversationsRouter = express.Router();

conversationsRouter.get("/", listConversations);
conversationsRouter.get("/:id", getConversation);

module.exports = { conversationsRouter };
