const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  findAgentRow,
  normalizeAgentName,
  parseAgentId,
  toAgentDetail,
  toAgentId,
  toAssignedClient,
  toClientListFilters,
  toListFilters,
} = require("../src/services/supportService");

describe("supportService agents", () => {
  it("builds a stable slug from the agent name", () => {
    assert.equal(toAgentId("Uwimanikunda lucie"), "uwimanikunda-lucie");
    assert.equal(toAgentId("  jean   claude  bikorimana "), "jean-claude-bikorimana");
    assert.equal(toAgentId("ISHYIGA Agent"), "ishyiga-agent");
  });

  it("keeps the eleven imported names unique after slugging", () => {
    const names = [
      "Fidelente HORANIMPUNDU",
      "Hagenimana emmanuel",
      "ISHYIGA Agent",
      "Josephine umwanankabandi",
      "MUKESHARUGAMBA Felicien",
      "Niyonsenga Eric",
      "TUYISHIME Olivier",
      "Theogene Hashimwimana",
      "Uwimanikunda lucie",
      "fidele ngendahimana",
      "jean claude bikorimana",
    ];
    const ids = names.map(toAgentId);
    assert.equal(new Set(ids).size, names.length);
  });

  it("maps search onto the agent name filter", () => {
    assert.equal(toListFilters({ search: "lucie" }).agent, "lucie");
    assert.equal(toClientListFilters({ search: "lucie", status: "Done" }).agent, "");
    assert.equal(toClientListFilters({ status: "Done" }).status, "Done");
  });

  it("finds an agent row by slug and serializes assigned clients", () => {
    const row = findAgentRow(
      [{ support_agent: "Uwimanikunda lucie", clients_count: 2 }],
      "uwimanikunda-lucie"
    );
    assert.equal(normalizeAgentName(row.support_agent), "uwimanikunda lucie");
    assert.equal(parseAgentId(""), "");

    const detail = toAgentDetail(row, [
      {
        id: "11111111-1111-1111-1111-111111111111",
        client_name: "TRUSTED PHARMACY LIMITED",
        location: "KIREHE",
        sector: "PHARMACY",
        visit_at: new Date("2026-09-16T13:57:00.000Z"),
        branches: 0,
        status: "Done",
        approval: "needs_approval",
        active: true,
        contact: "250789220619",
      },
    ]);

    assert.equal(detail.id, "uwimanikunda-lucie");
    assert.equal(detail.clientsCount, 1);
    assert.deepEqual(detail.clients[0], {
      id: "11111111-1111-1111-1111-111111111111",
      name: "TRUSTED PHARMACY LIMITED",
      location: "KIREHE",
      sector: "PHARMACY",
      visitAt: "2026-09-16T13:57:00.000Z",
      branches: 0,
      status: "Done",
      approval: "needs_approval",
      active: true,
      contact: "250789220619",
    });
    assert.equal(toAssignedClient(null), null);
  });
});
