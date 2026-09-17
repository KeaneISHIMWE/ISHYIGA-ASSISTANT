const express = require("express");
const { listSupport, getSupport } = require("../controllers/supportController");
const { requireConversationsAuth } = require("../middleware/conversationsAuth");

const supportRouter = express.Router();

supportRouter.use(requireConversationsAuth);
supportRouter.get("/", listSupport);
supportRouter.get("/:id", getSupport);

module.exports = { supportRouter };
