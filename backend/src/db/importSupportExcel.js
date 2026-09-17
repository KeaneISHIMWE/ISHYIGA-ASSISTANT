const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { pool } = require("../config/db");
const { parseSupportWorkbook } = require("../services/supportImport");
const supportModel = require("../models/support");
const { logger } = require("../utils/logger");

const DEFAULT_FILE = path.join(
  __dirname,
  "../../../docs/WOLF_Admin_Clients_September_contacts_filled.xlsx"
);
const DEFAULT_SHEET = "WOLF_Admin_Clients_September_20";

function resolveExcelPath() {
  return process.env.SUPPORT_EXCEL_PATH
    ? path.resolve(process.env.SUPPORT_EXCEL_PATH)
    : DEFAULT_FILE;
}

function loadSheetRows(filePath, sheetName) {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const name = sheetName || workbook.SheetNames[0];
  if (!workbook.Sheets[name]) {
    throw new Error(`Sheet not found: ${name}`);
  }

  return XLSX.utils.sheet_to_json(workbook.Sheets[name], {
    header: 1,
    defval: null,
    raw: true,
  });
}

async function importSupportExcel({
  filePath = resolveExcelPath(),
  sheetName = process.env.SUPPORT_EXCEL_SHEET || DEFAULT_SHEET,
  upsert = supportModel.upsert,
} = {}) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Excel file not found: ${filePath}`);
  }

  const parsed = parseSupportWorkbook(loadSheetRows(filePath, sheetName));
  if (!parsed.ok) {
    throw new Error(parsed.error || "Could not parse the Excel file");
  }

  let inserted = 0;
  let updated = 0;
  const failed = [];

  for (const record of parsed.records) {
    try {
      const row = await upsert(record);
      if (row && row.inserted) {
        inserted += 1;
      } else {
        updated += 1;
      }
    } catch (error) {
      failed.push({
        sourceRow: record.sourceRow,
        clientName: record.clientName,
        error: error.message,
      });
    }
  }

  return {
    filePath,
    sheetName,
    excelRecords: parsed.records.length + parsed.invalid.length,
    imported: parsed.records.length,
    inserted,
    updated,
    invalid: parsed.invalid,
    warnings: parsed.warnings,
    failed,
  };
}

async function main() {
  const summary = await importSupportExcel();
  logger.info("Support Excel import complete", {
    excelRecords: summary.excelRecords,
    imported: summary.imported,
    inserted: summary.inserted,
    updated: summary.updated,
    invalid: summary.invalid.length,
    warnings: summary.warnings.length,
    failed: summary.failed.length,
  });

  if (summary.invalid.length) {
    logger.warn("Support Excel invalid rows", {
      rows: summary.invalid.slice(0, 20),
    });
  }

  if (summary.failed.length) {
    logger.error("Support Excel rows failed to save", {
      rows: summary.failed.slice(0, 20),
    });
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main()
    .catch((error) => {
      logger.error("Support Excel import failed", { message: error.message });
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}

module.exports = {
  importSupportExcel,
  loadSheetRows,
  resolveExcelPath,
  DEFAULT_FILE,
  DEFAULT_SHEET,
};
