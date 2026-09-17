const supportModel = require("../models/support");
const { isUuid } = require("../services/dashboardService");
const { toSupportRecord, toListFilters } = require("../services/supportService");

async function listSupport(
  req,
  res,
  { list = supportModel.list } = {}
) {
  const rows = await list(toListFilters(req.query || {}));
  return res.status(200).json({
    support: rows.map(toSupportRecord),
    count: rows.length,
  });
}

async function getSupport(
  req,
  res,
  { findById = supportModel.findById } = {}
) {
  const id = req.params && req.params.id;
  if (!isUuid(id)) {
    return res.status(400).json({ error: "Invalid support id" });
  }

  const row = await findById(id);
  if (!row) {
    return res.status(404).json({ error: "Support record not found" });
  }

  return res.status(200).json({
    support: toSupportRecord(row),
  });
}

module.exports = {
  listSupport,
  getSupport,
};
