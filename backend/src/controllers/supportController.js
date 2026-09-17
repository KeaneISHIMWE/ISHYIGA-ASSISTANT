const supportModel = require("../models/support");
const {
  findAgentRow,
  normalizeAgentName,
  parseAgentId,
  toAgentDetail,
  toAgentSummary,
  toAssignedClient,
  toClientListFilters,
  toListFilters,
} = require("../services/supportService");

function readAgentId(req) {
  return parseAgentId(req.params && req.params.id);
}

async function listSupport(
  req,
  res,
  { listAgents = supportModel.listAgents } = {}
) {
  const rows = await listAgents(toListFilters(req.query || {}));
  return res.status(200).json({
    agents: rows.map((row) => toAgentSummary(row)),
    count: rows.length,
  });
}

async function loadAgent(
  req,
  {
    listAgents = supportModel.listAgents,
    listByAgentKey = supportModel.listByAgentKey,
  } = {}
) {
  const id = readAgentId(req);
  if (!id) {
    return { error: { status: 400, body: { error: "Invalid support agent id" } } };
  }

  const agents = await listAgents();
  const agent = findAgentRow(agents, id);
  if (!agent) {
    return { error: { status: 404, body: { error: "Support agent not found" } } };
  }

  const clients = await listByAgentKey(
    normalizeAgentName(agent.support_agent),
    toClientListFilters(req.query || {})
  );

  return { id, agent, clients };
}

async function getSupport(req, res, deps = {}) {
  const result = await loadAgent(req, deps);
  if (result.error) {
    return res.status(result.error.status).json(result.error.body);
  }

  return res.status(200).json({
    agent: toAgentDetail(result.agent, result.clients),
  });
}

async function listSupportClients(req, res, deps = {}) {
  const result = await loadAgent(req, deps);
  if (result.error) {
    return res.status(result.error.status).json(result.error.body);
  }

  return res.status(200).json({
    clients: result.clients.map(toAssignedClient),
    count: result.clients.length,
  });
}

module.exports = {
  listSupport,
  getSupport,
  listSupportClients,
};
