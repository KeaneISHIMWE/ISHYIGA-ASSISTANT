const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  listSupport,
  getSupport,
  listSupportClients,
} = require("../src/controllers/supportController");

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

const lucieVisit = {
  id: "11111111-1111-1111-1111-111111111111",
  source_row: 0,
  client_name: "TRUSTED PHARMACY LIMITED",
  support_agent: "Uwimanikunda lucie",
  location: "KIREHE",
  sector: "PHARMACY",
  visit_at: new Date("2026-09-16T13:57:00.000Z"),
  branches: 0,
  status: "Done",
  approval: "needs_approval",
  active: true,
  contact: "250789220619",
  created_at: new Date("2026-09-16T13:57:00.000Z"),
  updated_at: new Date("2026-09-16T13:57:00.000Z"),
};

function agentDeps({
  agents = [{ support_agent: "Uwimanikunda lucie", clients_count: 44 }],
  clients = [lucieVisit],
} = {}) {
  return {
    listAgents: async (filters = {}) => {
      if (filters.agent && !/lucie/i.test(filters.agent)) {
        return [];
      }
      if (filters.status && filters.status !== "Done") {
        return [];
      }
      return agents;
    },
    listByAgentKey: async (agentKey, filters = {}) => {
      assert.equal(agentKey, "uwimanikunda lucie");
      if (filters.status && filters.status !== "Done") {
        return [];
      }
      if (filters.client && !/trusted/i.test(filters.client)) {
        return [];
      }
      return clients;
    },
  };
}

describe("supportController", () => {
  it("lists support agents and applies search to the agent name", async () => {
    const res = mockRes();
    let received;
    await listSupport(
      { query: { search: "lucie", location: "KIREHE" } },
      res,
      {
        listAgents: async (filters) => {
          received = filters;
          return [{ support_agent: "Uwimanikunda lucie", clients_count: 12 }];
        },
      }
    );

    assert.equal(received.agent, "lucie");
    assert.equal(received.location, "KIREHE");
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.count, 1);
    assert.equal(res.body.agents[0].id, "uwimanikunda-lucie");
    assert.equal(res.body.agents[0].name, "Uwimanikunda lucie");
    assert.equal(res.body.agents[0].clientsCount, 12);
    assert.equal(res.body.agents[0].phone, undefined);
    assert.equal(res.body.agents[0].email, undefined);
  });

  it("returns an empty agent list when filters match nothing", async () => {
    const res = mockRes();
    await listSupport({ query: { search: "nobody" } }, res, {
      listAgents: async () => [],
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { agents: [], count: 0 });
  });

  it("returns one agent and assigned client contact from the support row", async () => {
    const res = mockRes();
    await getSupport({ params: { id: "uwimanikunda-lucie" }, query: {} }, res, agentDeps());

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.agent.id, "uwimanikunda-lucie");
    assert.equal(res.body.agent.name, "Uwimanikunda lucie");
    assert.equal(res.body.agent.clientsCount, 1);
    assert.equal(res.body.agent.clients[0].name, "TRUSTED PHARMACY LIMITED");
    assert.equal(res.body.agent.clients[0].contact, "250789220619");
    assert.equal(res.body.agent.clients[0].status, "Done");
  });

  it("lists assigned clients and applies visit filters", async () => {
    const res = mockRes();
    await listSupportClients(
      { params: { id: "uwimanikunda-lucie" }, query: { status: "Done" } },
      res,
      agentDeps()
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.count, 1);
    assert.equal(res.body.clients[0].location, "KIREHE");
    assert.equal(res.body.clients[0].contact, "250789220619");
  });

  it("returns an empty client list for an agent with no matching visits", async () => {
    const res = mockRes();
    await listSupportClients(
      { params: { id: "uwimanikunda-lucie" }, query: { status: "Refused" } },
      res,
      agentDeps()
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { clients: [], count: 0 });
  });

  it("rejects a missing support agent id", async () => {
    const res = mockRes();
    await getSupport({ params: { id: "   " }, query: {} }, res, {
      listAgents: async () => {
        throw new Error("should not query");
      },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "Invalid support agent id");
  });

  it("returns 404 for an unknown support agent", async () => {
    const res = mockRes();
    await getSupport(
      { params: { id: "not-a-real-agent" }, query: {} },
      res,
      agentDeps({ agents: [] })
    );
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, "Support agent not found");
  });
});
