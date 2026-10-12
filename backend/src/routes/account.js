const express = require("express");
const { getAccount } = require("../controllers/accountController");
const { requireConversationsAuth } = require("../middleware/conversationsAuth");

const accountRouter = express.Router();

accountRouter.use(requireConversationsAuth);
accountRouter.get("/", getAccount);

module.exports = { accountRouter };
