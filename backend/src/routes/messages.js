const express = require("express");
const { createMessage } = require("../controllers/messagesController");

const messagesRouter = express.Router();

messagesRouter.post("/", createMessage);

module.exports = { messagesRouter };
