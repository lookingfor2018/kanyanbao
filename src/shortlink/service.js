const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { ensureDir, writeJson } = require("../shared/fs-utils");

function normalizeBaseUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}

function makeCode(seed, length) {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digest = crypto.createHash("sha256").update(seed).digest();
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[digest[i] % alphabet.length];
  }
  return out;
}

function renderRedirectHtml(targetUrl) {
  const safeUrl = String(targetUrl).replace(/"/g, "&quot;");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="0;url=${safeUrl}" />
  <title>Redirecting...</title>
</head>
<body>
  <p>Redirecting to report...</p>
  <p><a href="${safeUrl}">如果没有自动跳转，请点击这里</a></p>
  <script>window.location.replace(${JSON.stringify(targetUrl)});</script>
</body>
</html>
`;
}

function createStaticRedirectShortlink({
  distRoot,
  shortlinkBaseUrl,
  signingKey,
  codeLength,
  runId,
  ticker,
  sourceReportId,
  targetUrl,
}) {
  const seedKey = signingKey || crypto.randomBytes(16).toString("hex");
  const code = makeCode(`${seedKey}:${runId}:${ticker}:${sourceReportId}`, codeLength || 8);
  const dirPath = path.join(distRoot, "r", code);
  const filePath = path.join(dirPath, "index.html");
  ensureDir(dirPath);
  fs.writeFileSync(filePath, renderRedirectHtml(targetUrl), "utf8");

  const shortUrl = `${normalizeBaseUrl(shortlinkBaseUrl)}/r/${code}/`;
  return {
    ok: true,
    provider: "static_redirect",
    code,
    short_url: shortUrl,
    file_path: filePath,
  };
}

async function createApiShortlink({
  endpoint,
  token,
  runId,
  codeLength,
  signingKey,
  ticker,
  sourceReportId,
  targetUrl,
}) {
  const code = makeCode(
    `${signingKey || "short"}:${runId}:${ticker}:${sourceReportId}:${targetUrl}`,
    codeLength || 8
  );
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      code,
      target_url: targetUrl,
      metadata: {
        run_id: runId,
        ticker,
        source_report_id: sourceReportId,
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !(body.short_url || body.url)) {
    return {
      ok: false,
      provider: "api",
      error: `shortlink api failed: status=${response.status}, body=${JSON.stringify(body)}`,
    };
  }
  return {
    ok: true,
    provider: "api",
    code,
    short_url: body.short_url || body.url,
    raw_response: body,
  };
}

async function createShortlink({
  env,
  distRoot,
  runId,
  ticker,
  sourceReportId,
  targetUrl,
  runDate,
}) {
  const provider = env.shortlink.provider || "static_redirect";
  if (provider === "api") {
    if (!env.shortlink.apiEndpoint) {
      return { ok: false, provider: "api", error: "SHORTLINK_API_ENDPOINT is required when SHORTLINK_PROVIDER=api" };
    }
    const apiResult = await createApiShortlink({
      endpoint: env.shortlink.apiEndpoint,
      token: env.shortlink.apiToken,
      runId,
      codeLength: env.shortlink.codeLength,
      signingKey: env.shortlink.signingKey,
      ticker,
      sourceReportId,
      targetUrl,
    });
    return apiResult;
  }

  if (!env.shortlink.baseUrl) {
    return { ok: false, provider: "static_redirect", error: "SHORTLINK_BASE_URL is required" };
  }

  const staticResult = createStaticRedirectShortlink({
    distRoot,
    shortlinkBaseUrl: env.shortlink.baseUrl,
    signingKey: env.shortlink.signingKey,
    codeLength: env.shortlink.codeLength,
    runId,
    ticker,
    sourceReportId,
    targetUrl,
  });

  const manifestPath = path.join(distRoot, "r", "manifest.json");
  const existing = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : { run_date: runDate, links: [] };
  existing.run_date = runDate;
  existing.links = Array.isArray(existing.links) ? existing.links : [];
  existing.links.push({
    code: staticResult.code,
    short_url: staticResult.short_url,
    target_url: targetUrl,
    ticker,
    source_report_id: sourceReportId,
  });
  writeJson(manifestPath, existing);

  return staticResult;
}

function verifyStaticRedirectFile(filePath, targetUrl) {
  if (!fs.existsSync(filePath)) {
    return {
      ok: false,
      detail: "shortlink redirect file not found",
    };
  }
  const html = fs.readFileSync(filePath, "utf8");
  const ok = html.includes(targetUrl);
  return {
    ok,
    detail: ok ? "redirect file verified" : "redirect file exists but target url mismatch",
  };
}

module.exports = {
  createShortlink,
  verifyStaticRedirectFile,
};

