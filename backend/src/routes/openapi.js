const express = require("express");
const { getOpenApi } = require("../controllers/openapiController");

const openapiRouter = express.Router();

openapiRouter.get("/", getOpenApi);

module.exports = { openapiRouter };
