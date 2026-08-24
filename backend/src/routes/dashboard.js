const express = require("express");
const { getOverview } = require("../controllers/conversationsController");
const { requireConversationsAuth } = require("../middleware/conversationsAuth");

const dashboardRouter = express.Router();

dashboardRouter.use(requireConversationsAuth);
dashboardRouter.get("/", getOverview);

module.exports = { dashboardRouter };
