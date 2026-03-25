const fs = require("fs");
const path = require("path");
const { runAcquisition } = require("../agents/acquisition");
const { runSummary } = require("../agents/summary");
const { runPublish } = require("../agents/publish");
const { runAcceptance } = require("../agents/acceptance");
const { loadEnv } = require("../config/load-env");
const { readSecurityMaster, readWatchlist } = require("../shared/csv-utils");
const {
  ensureDistLayout,
  ensureRuntimeLayout,
  writeJson,
  writeText,
} = require("../shared/fs-utils");
const { RunLogger } = require("../shared/logger");
const { makeRunId, todayInCst } = require("../shared/time");

function normalizeForceTickers(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim().toUpperCase()).filter(Boolean);
  }
  return String(value)
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function validateRunDate(runDate) {
  return /^\d{4}-\d{2}-\d{2}$/.test(runDate);
}

async function runOrchestration({
  rootDir = process.cwd(),
  runDate,
  mode,
  forceTickers = [],
  notes = "",
  skipPush = false,
} = {}) {
  const env = loadEnv(rootDir);
  const resolvedRunDate = runDate || todayInCst();
  if (!validateRunDate(resolvedRunDate)) {
    throw new Error(`Invalid run_date: ${resolvedRunDate}, expected YYYY-MM-DD`);
  }

  const request = {
    run_date: resolvedRunDate,
    timezone: env.runTimezone,
    mode: mode || env.defaultRunMode,
    force_tickers: normalizeForceTickers(forceTickers),
    notes: notes || "",
  };

  const runContext = {
    runId: makeRunId(request.run_date),
    runDate: request.run_date,
    timezone: request.timezone,
    mode: request.mode,
    forceTickers: request.force_tickers,
    notes: request.notes,
  };

  const watchlistPath = path.join(rootDir, "watchlist.csv");
  const securityMasterPath = path.join(rootDir, "config", "security_master.csv");
  if (!fs.existsSync(watchlistPath)) {
    throw new Error("Missing required file: watchlist.csv");
  }
  if (!fs.existsSync(securityMasterPath)) {
    throw new Error("Missing required file: config/security_master.csv");
  }

  const runtimePaths = ensureRuntimeLayout(rootDir, request.run_date);
  const distPaths = ensureDistLayout(rootDir, request.run_date);
  const logger = new RunLogger(runtimePaths.logFile, runContext.runId);
  logger.info("orchestrator", "Run started", { jobId: "batch" });

  const watchlist = readWatchlist(watchlistPath);
  const securityRecords = readSecurityMaster(securityMasterPath);
  logger.info("orchestrator", `Loaded watchlist(${watchlist.length}) and security master(${securityRecords.length})`);

  const acquisitionResult = await runAcquisition({
    rootDir,
    env,
    runContext,
    request,
    runtimePaths,
    watchlist,
    securityRecords,
    logger,
  });
  writeJson(path.join(runtimePaths.manifestDir, "report_candidates.json"), acquisitionResult.reportCandidates);
  writeJson(path.join(runtimePaths.manifestDir, "sanitized_assets.json"), acquisitionResult.sanitizedAssets);

  const summaryResult = await runSummary({
    runContext,
    sanitizedAssets: acquisitionResult.sanitizedAssets,
    logger,
  });
  writeJson(path.join(runtimePaths.structuredDir, "summary_records.json"), summaryResult.summaryRecords);
  writeText(path.join(runtimePaths.structuredDir, "summary_table.md"), summaryResult.summaryTableMarkdown);
  writeText(path.join(runtimePaths.structuredDir, "report_summaries.md"), summaryResult.reportSummariesMarkdown);

  const publishResult = await runPublish({
    rootDir,
    distPaths,
    env,
    runContext,
    summaryRecords: summaryResult.summaryRecords,
    summaryTableMarkdown: summaryResult.summaryTableMarkdown,
    reportSummariesMarkdown: summaryResult.reportSummariesMarkdown,
    skipPush,
    logger,
  });

  writeJson(path.join(runtimePaths.structuredDir, "summary_records.json"), publishResult.summaryRecordsWithLinks);
  writeText(path.join(runtimePaths.publishedDir, "daily_digest.md"), publishResult.dailyDigestMarkdown);
  writeJson(path.join(runtimePaths.publishedDir, "daily_digest.json"), publishResult.dailyDigest);
  writeJson(path.join(runtimePaths.publishedDir, "delivery_payload.json"), publishResult.deliveryPayload);
  writeText(distPaths.indexHtml, publishResult.rootHtml);
  writeText(distPaths.batchHtml, publishResult.batchHtml);
  writeJson(distPaths.manifest, publishResult.distManifest);

  const acceptanceResult = runAcceptance({
    runContext,
    acquisitionResult,
    summaryResult: {
      ...summaryResult,
      summaryRecords: publishResult.summaryRecordsWithLinks,
    },
    publishResult,
  });
  writeText(path.join(runtimePaths.publishedDir, "acceptance_report.md"), acceptanceResult.acceptanceReportMarkdown);
  writeJson(path.join(runtimePaths.publishedDir, "manual_review_queue.json"), acceptanceResult.manualReviewQueue);
  writeJson(path.join(runtimePaths.publishedDir, "recovery_queue.json"), acceptanceResult.recoveryQueue);

  logger.info("orchestrator", `Run finished with decision=${acceptanceResult.decision}`, { jobId: "batch" });

  return {
    request,
    runContext,
    paths: {
      runtime: runtimePaths,
      dist: distPaths,
    },
    acquisitionResult,
    summaryResult,
    publishResult,
    acceptanceResult,
  };
}

module.exports = {
  runOrchestration,
};
