const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function splitExtraPatterns(extraPatterns) {
  const literalTerms = [];
  const regexPatterns = [];
  for (const pattern of extraPatterns || []) {
    const value = String(pattern || "").trim();
    if (!value) {
      continue;
    }
    if (value.startsWith("re:")) {
      regexPatterns.push(value.slice(3));
      continue;
    }
    if (value.startsWith("/") && value.endsWith("/") && value.length > 2) {
      regexPatterns.push(value.slice(1, -1));
      continue;
    }
    literalTerms.push(value);
  }
  return { literalTerms, regexPatterns };
}

function buildRulesPayload(sanitizeConfig) {
  const extra = splitExtraPatterns(sanitizeConfig.extraPatterns || []);
  const literals = [
    ...(sanitizeConfig.entityNames || []),
    ...(sanitizeConfig.personNames || []),
    ...extra.literalTerms,
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  return {
    fixed_prefix: "本报告仅供",
    fixed_suffix: "已记录日志请勿传阅",
    literal_terms: literals,
    regex_patterns: extra.regexPatterns,
    require_hit: false,
  };
}

function runPythonRedaction({
  rootDir,
  inputPath,
  outputPath,
  sanitizeConfig,
}) {
  const scriptPath = path.join(rootDir, "scripts", "redact_pdf.py");
  const rulesFile = path.join(path.dirname(outputPath), `${path.basename(outputPath, ".pdf")}.rules.json`);
  const rulesPayload = buildRulesPayload(sanitizeConfig);
  fs.writeFileSync(rulesFile, JSON.stringify(rulesPayload, null, 2), "utf8");

  const processResult = spawnSync(
    "python",
    [scriptPath, "--input", inputPath, "--output", outputPath, "--rules-file", rulesFile],
    {
      cwd: rootDir,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    }
  );

  try {
    if (processResult.error) {
      return {
        ok: false,
        status: "failed",
        error: String(processResult.error),
      };
    }
    const stdout = String(processResult.stdout || "").trim();
    const stderr = String(processResult.stderr || "").trim();
    let parsed = {};
    if (stdout) {
      try {
        parsed = JSON.parse(stdout);
      } catch (_error) {
        parsed = {
          ok: false,
          status: "failed",
          error: `redaction stdout is not json: ${stdout.slice(0, 500)}`,
        };
      }
    }

    if (processResult.status !== 0) {
      return {
        ok: false,
        status: "failed",
        error: parsed.error || `python exited with code ${processResult.status}`,
        stderr,
      };
    }

    if (!parsed || parsed.ok !== true) {
      return {
        ok: false,
        status: "failed",
        error: parsed?.error || "redaction script returned non-ok result",
        stderr,
      };
    }

    return {
      ...parsed,
      ok: true,
    };
  } finally {
    if (fs.existsSync(rulesFile)) {
      fs.unlinkSync(rulesFile);
    }
  }
}

module.exports = {
  runPythonRedaction,
};

