const path = require("path");
const { spawnSync } = require("child_process");

function extractPdfText({
  rootDir,
  inputPath,
  maxPages = 8,
  maxChars = 120000,
}) {
  const scriptPath = path.join(rootDir, "scripts", "extract_pdf_text.py");
  const result = spawnSync(
    "python",
    [
      scriptPath,
      "--input",
      inputPath,
      "--max-pages",
      String(maxPages),
      "--max-chars",
      String(maxChars),
    ],
    {
      cwd: rootDir,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    }
  );

  if (result.error) {
    return { ok: false, error: String(result.error), text: "" };
  }

  const stdout = String(result.stdout || "").trim();
  if (!stdout) {
    return {
      ok: false,
      error: `extract_pdf_text returned empty stdout (code=${result.status})`,
      text: "",
    };
  }

  let payload = null;
  try {
    payload = JSON.parse(stdout);
  } catch (_error) {
    return {
      ok: false,
      error: `extract_pdf_text stdout is not json: ${stdout.slice(0, 500)}`,
      text: "",
    };
  }

  if (result.status !== 0 || payload.ok !== true) {
    return {
      ok: false,
      error: payload.error || `extract_pdf_text failed (code=${result.status})`,
      text: "",
    };
  }

  return {
    ok: true,
    text: String(payload.text || ""),
    pageCount: Number(payload.page_count || 0),
    chars: Number(payload.chars || 0),
  };
}

module.exports = {
  extractPdfText,
};

