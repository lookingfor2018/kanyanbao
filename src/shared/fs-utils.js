const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureRuntimeLayout(rootDir, runDate) {
  const runtimeRoot = path.join(rootDir, "runtime");
  const paths = {
    runtimeRoot,
    rawDir: path.join(runtimeRoot, "raw_reports", runDate),
    sanitizedDir: path.join(runtimeRoot, "sanitized_reports", runDate),
    manifestDir: path.join(runtimeRoot, "manifests", runDate),
    structuredDir: path.join(runtimeRoot, "structured", runDate),
    publishedDir: path.join(runtimeRoot, "published", runDate),
    logsDir: path.join(runtimeRoot, "logs"),
    logFile: path.join(runtimeRoot, "logs", `${runDate}.jsonl`),
  };
  ensureDir(paths.rawDir);
  ensureDir(paths.sanitizedDir);
  ensureDir(paths.manifestDir);
  ensureDir(paths.structuredDir);
  ensureDir(paths.publishedDir);
  ensureDir(paths.logsDir);

  return paths;
}

function ensureDistLayout(rootDir, runDate) {
  const distRoot = path.join(rootDir, "dist");
  const batchDir = path.join(distRoot, "batches", runDate);
  ensureDir(batchDir);
  return {
    distRoot,
    batchDir,
    indexHtml: path.join(distRoot, "index.html"),
    batchHtml: path.join(batchDir, "index.html"),
    manifest: path.join(batchDir, "manifest.json"),
  };
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath, text) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, text, "utf8");
}

function appendJsonl(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function readJsonIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return fallback;
  }
}

function listFilesWithExt(dirPath, ext) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(ext.toLowerCase()))
    .map((entry) => path.join(dirPath, entry.name));
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const content = fs.readFileSync(filePath);
  hash.update(content);
  return hash.digest("hex");
}

function safeCopyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

module.exports = {
  ensureDir,
  ensureRuntimeLayout,
  ensureDistLayout,
  writeJson,
  writeText,
  appendJsonl,
  readJsonIfExists,
  listFilesWithExt,
  sha256File,
  safeCopyFile,
};
