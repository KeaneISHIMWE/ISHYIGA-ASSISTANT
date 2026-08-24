const express = require("express");
const { getOverview } = require("../controllers/conversationsController");

const dashboardRouter = express.Router();

dashboardRouter.get("/", getOverview);

module.exports = { dashboardRouter };
