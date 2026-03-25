const fs = require("fs");

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells.map((item) => item.trim());
}

function parseCsv(content) {
  const normalized = content.replace(/^\uFEFF/, "");
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "");
  if (lines.length === 0) {
    return [];
  }
  const headers = splitCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = splitCsvLine(lines[i]);
    if (values.length === 1 && values[0] === "") {
      continue;
    }
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function readWatchlist(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const tickers = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim().toUpperCase())
    .filter(Boolean);
  return [...new Set(tickers)];
}

function readSecurityMaster(filePath) {
  const rows = parseCsv(fs.readFileSync(filePath, "utf8"));
  return rows
    .filter((row) => String(row.is_active || "").trim().toLowerCase() === "true")
    .map((row) => ({
      ticker: String(row.ticker || "").trim().toUpperCase(),
      name: String(row.name || "").trim(),
      section: String(row.section || "").trim() || "其他",
      aliases: String(row.aliases || "")
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean),
      is_active: true,
    }))
    .filter((row) => row.ticker);
}

module.exports = {
  parseCsv,
  readWatchlist,
  readSecurityMaster,
};

