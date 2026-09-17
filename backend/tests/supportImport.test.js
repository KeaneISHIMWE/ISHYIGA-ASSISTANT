const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseSupportWorkbook,
  toBooleanActive,
  toIntegerBranches,
  toVisitAt,
  toContact,
} = require("../src/services/supportImport");

describe("supportImport", () => {
  it("maps Active to boolean and branches to integers", () => {
    assert.deepEqual(toBooleanActive("Active"), {
      ok: true,
      value: true,
      missing: false,
    });
    assert.deepEqual(toIntegerBranches(2), {
      ok: true,
      value: 2,
      missing: false,
    });
  });

  it("treats No date set and missing location markers as empty", () => {
    assert.equal(toVisitAt("No date set").value, null);
    assert.equal(toVisitAt("No date set").missing, true);
    assert.equal(toContact(250781065084), "250781065084");
  });

  it("parses the WOLF header row and keeps valid Excel records", () => {
    const rows = [
      [],
      [],
      [
        "#",
        "Client Name",
        "Support Agent",
        "Location",
        "Sector",
        "Visit Date",
        "Branches",
        "Status",
        "Approval",
        "Active",
        "contact",
      ],
      [
        0,
        "TRUSTED PHARMACY LIMITED",
        "Uwimanikunda lucie",
        "KIREHE",
        "PHARMACY",
        new Date("2026-09-16T13:57:00.000Z"),
        0,
        "Done",
        "needs_approval",
        "Active",
        250781065084,
      ],
      [
        2,
        "URUMURI PHARMACY LTD",
        "ISHYIGA Agent",
        "\uFFFD",
        "PHARMACY",
        "No date set",
        0,
        "Pending",
        "pending",
        "Active",
        null,
      ],
      [],
    ];

    const parsed = parseSupportWorkbook(rows);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.records.length, 2);
    assert.equal(parsed.invalid.length, 0);
    assert.equal(parsed.records[0].clientName, "TRUSTED PHARMACY LIMITED");
    assert.equal(parsed.records[0].contact, "250781065084");
    assert.equal(parsed.records[0].active, true);
    assert.equal(parsed.records[1].visitAt, null);
    assert.equal(parsed.records[1].location, null);
    assert.ok(parsed.warnings.some((item) => item.issues.includes("missing_contact")));
  });

  it("reports a missing client name instead of discarding it silently", () => {
    const parsed = parseSupportWorkbook([
      [
        "#",
        "Client Name",
        "Support Agent",
        "Location",
        "Sector",
        "Visit Date",
        "Branches",
        "Status",
        "Approval",
        "Active",
        "contact",
      ],
      [9, "", "Agent", "Kigali", "PHARMACY", "No date set", 0, "Pending", "pending", "Active", null],
    ]);

    assert.equal(parsed.records.length, 0);
    assert.equal(parsed.invalid[0].error, "missing_client_name");
  });
});
