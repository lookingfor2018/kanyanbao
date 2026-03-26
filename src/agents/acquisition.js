const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { createStandardError } = require("../config/contracts");
const { listFilesWithExt, readJsonIfExists, safeCopyFile, sha256File } = require("../shared/fs-utils");
const { formatIsoCst, fromCnDateTime, isWithinNaturalDays } = require("../shared/time");
const { runPythonRedaction } = require("../sanitize/redact-pdf");
const { extractPdfText } = require("../sanitize/extract-pdf-text");

function runLiveAcquisitionProbe({ rootDir, logger }) {
  const scriptPath = path.join(rootDir, "temp", "verify_kanzhiqiu_login_download.cjs");
  if (!fs.existsSync(scriptPath)) {
    logger.warn("acquisition", "Live acquisition script not found, fallback to local sample");
    return { ok: false, message: "missing live script" };
  }
  const result = spawnSync("node", [scriptPath], {
    cwd: rootDir,
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) {
    logger.warn("acquisition", `Live acquisition probe failed: ${String(result.error)}`);
    return { ok: false, message: String(result.error) };
  }
  if (result.status !== 0) {
    logger.warn(
      "acquisition",
      `Live acquisition probe exited with code ${result.status}; stderr=${String(result.stderr || "").slice(0, 300)}`
    );
    return { ok: false, message: `exit=${result.status}` };
  }
  logger.info("acquisition", "Live acquisition probe completed");
  return { ok: true, message: "completed" };
}

function parseReportId(filePath) {
  const base = path.basename(filePath);
  const match = /(\d{6,})/.exec(base);
  if (match) {
    return match[1];
  }
  return `local-${Date.now()}`;
}

function extractChunkAroundReportId(reportHomeHtml, reportId) {
  if (!reportHomeHtml || !reportId) {
    return "";
  }
  const keyword = `download.htm?id=${reportId}`;
  const position = reportHomeHtml.indexOf(keyword);
  if (position < 0) {
    return "";
  }
  const start = Math.max(0, position - 1200);
  const end = Math.min(reportHomeHtml.length, position + 1200);
  return reportHomeHtml.slice(start, end);
}

function inferUploadAt(chunk, fallbackIso) {
  const inferred = fromCnDateTime(chunk);
  return inferred || fallbackIso;
}

function inferBroker(chunk) {
  const match = /<a href="\/newBroker\/brokerCenter\.htm[^"]*"[^>]*>([^<]+)<\/a>/.exec(chunk);
  if (!match) {
    return "N/A";
  }
  return match[1].trim() || "N/A";
}

function inferTitle(chunk, reportId) {
  const titleMatch = /title="([^"]{6,120})"/.exec(chunk);
  if (titleMatch) {
    return titleMatch[1].trim();
  }
  return `Report ${reportId}`;
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countMatches(text, pattern, flags = "gi") {
  try {
    const regex = new RegExp(pattern, flags);
    const matches = text.match(regex);
    return matches ? matches.length : 0;
  } catch (_error) {
    return 0;
  }
}

function inferTicker(text, watchlist, securityByTicker) {
  const normalized = String(text || "");
  if (!normalized.trim()) {
    return { ticker: "", matchedBy: "manual_required", confidence: "low", record: null };
  }

  const scores = watchlist.map((ticker) => {
    const exactCount = countMatches(normalized, `(?:^|[^A-Za-z0-9])${escapeRegex(ticker)}(?:[^A-Za-z0-9]|$)`, "gi");
    const record = securityByTicker.get(ticker);
    const aliases = record ? [record.name, ...(record.aliases || [])] : [];
    const aliasCount = aliases
      .filter(Boolean)
      .map((alias) => countMatches(normalized, escapeRegex(alias), "gi"))
      .reduce((sum, count) => sum + count, 0);
    const totalScore = exactCount * 10 + aliasCount;
    return {
      ticker,
      exactCount,
      aliasCount,
      totalScore,
      record: record || null,
    };
  });

  const positives = scores.filter((item) => item.totalScore > 0).sort((a, b) => b.totalScore - a.totalScore);
  if (positives.length === 0) {
    return { ticker: "", matchedBy: "manual_required", confidence: "low", record: null };
  }

  const top = positives[0];
  const second = positives[1];
  const clearlyAhead = !second || top.totalScore >= second.totalScore + 3;
  if (!clearlyAhead) {
    return { ticker: "", matchedBy: "manual_required", confidence: "low", record: null };
  }

  if (top.exactCount > 0) {
    return {
      ticker: top.ticker,
      matchedBy: "ticker_exact",
      confidence: top.exactCount >= 2 ? "high" : "medium",
      record: top.record || null,
    };
  }

  return {
    ticker: top.ticker,
    matchedBy: "alias_match",
    confidence: top.aliasCount >= 2 ? "medium" : "low",
    record: top.record || null,
  };
}

async function runAcquisition({
  rootDir,
  env,
  runContext,
  request,
  runtimePaths,
  watchlist,
  securityRecords,
  logger,
}) {
  const stage = "acquisition";
  const reportCandidates = [];
  const sanitizedAssets = [];
  const errors = [];
  const warnings = [];

  const securityByTicker = new Map(securityRecords.map((item) => [item.ticker, item]));

  if (env.feature.enableLiveAcquisition) {
    runLiveAcquisitionProbe({ rootDir, logger });
  }

  const reportHomePath = path.join(rootDir, "temp", "artifacts", "report_home.html");
  const reportHomeHtml = fs.existsSync(reportHomePath) ? fs.readFileSync(reportHomePath, "utf8") : "";

  const verifyResult = readJsonIfExists(path.join(rootDir, "temp", "artifacts", "verify_result.json"), {});
  const fallbackUploadAt = verifyResult.finishedAt
    ? String(verifyResult.finishedAt).replace("Z", "+00:00")
    : formatIsoCst();

  const localDownloads = listFilesWithExt(path.join(rootDir, "temp", "downloads"), ".pdf").sort((a, b) => {
    const aTime = fs.statSync(a).mtimeMs;
    const bTime = fs.statSync(b).mtimeMs;
    return bTime - aTime;
  });

  if (localDownloads.length === 0) {
    const error = createStandardError({
      code: "NO_LOCAL_REPORT",
      stage,
      message: "No local PDF found in temp/downloads",
      fatal: false,
      retryable: true,
    });
    errors.push(error);
    logger.warn(stage, error.message, { errorCode: error.code });
    return { reportCandidates, sanitizedAssets, errors, warnings };
  }

  const sourcePath = localDownloads[0];
  const sourceReportId = parseReportId(sourcePath);
  const chunk = extractChunkAroundReportId(reportHomeHtml, sourceReportId);
  let tickerInfo = inferTicker(chunk, watchlist, securityByTicker);
  if (tickerInfo.matchedBy === "manual_required") {
    const textResult = extractPdfText({
      rootDir,
      inputPath: sourcePath,
      maxPages: 10,
      maxChars: 160000,
    });
    if (textResult.ok && textResult.text) {
      const fallbackTickerInfo = inferTicker(textResult.text, watchlist, securityByTicker);
      if (fallbackTickerInfo.matchedBy !== "manual_required") {
        tickerInfo = fallbackTickerInfo;
        logger.info(stage, "Ticker inferred from PDF text fallback", {
          ticker: tickerInfo.ticker,
          jobId: `UNKNOWN-${sourceReportId}`,
        });
      } else {
        logger.warn(stage, "Ticker still ambiguous after PDF text fallback", {
          jobId: `UNKNOWN-${sourceReportId}`,
        });
      }
    } else {
      logger.warn(stage, "PDF text extraction failed for ticker fallback", {
        jobId: `UNKNOWN-${sourceReportId}`,
      });
    }
  }
  const chosenTicker = tickerInfo.ticker || "UNKNOWN";
  const record = tickerInfo.record || {
    ticker: chosenTicker,
    name: chosenTicker,
    section: "其他",
    aliases: [chosenTicker],
  };
  const uploadAt = inferUploadAt(chunk, fallbackUploadAt);
  const isNew = isWithinNaturalDays(uploadAt, request.run_date, 1);
  const inWindow = isWithinNaturalDays(uploadAt, request.run_date, 6);
  const broker = inferBroker(chunk);
  const title = inferTitle(chunk, sourceReportId);

  const rawFileName = `${request.run_date}_${chosenTicker}_${sourceReportId}_raw.pdf`;
  const rawTargetPath = path.join(runtimePaths.rawDir, rawFileName);
  safeCopyFile(sourcePath, rawTargetPath);

  const shouldMarkNeedsReview = tickerInfo.matchedBy === "manual_required" || !inWindow;
  const candidateStatus = shouldMarkNeedsReview ? "needs_review" : "completed";

  const candidate = {
    run_id: runContext.runId,
    source: "kanzhiqiu",
    source_report_id: sourceReportId,
    title,
    broker,
    ticker: record.ticker,
    name: record.name || record.ticker,
    section: record.section || "其他",
    upload_at: uploadAt,
    is_new: Boolean(isNew),
    matched_by: tickerInfo.matchedBy,
    page_url: env.kzq.reportHomeUrl,
    download_url: `https://www.kanzhiqiu.com/imageserver/report/download.htm?id=${sourceReportId}`,
    raw_pdf_path: path.relative(rootDir, rawTargetPath).replaceAll("\\", "/"),
    acquisition_status: candidateStatus,
    error: null,
  };

  if (shouldMarkNeedsReview) {
    candidate.error = createStandardError({
      code: "MATCH_NEEDS_REVIEW",
      stage,
      message: "Ticker match is ambiguous or outside run window; blocked for manual review",
      fatal: false,
      retryable: false,
      detail: {
        matched_by: tickerInfo.matchedBy,
        upload_at: uploadAt,
        run_date: request.run_date,
      },
    });
    warnings.push(candidate.error.message);
    logger.warn(stage, candidate.error.message, { ticker: candidate.ticker, jobId: `${candidate.ticker}-${sourceReportId}` });
  } else {
    logger.info(stage, "Downloaded report copied into runtime/raw_reports", {
      ticker: candidate.ticker,
      jobId: `${candidate.ticker}-${sourceReportId}`,
    });
  }
  reportCandidates.push(candidate);

  const sanitizedFileName = `${request.run_date}_${chosenTicker}_${sourceReportId}_sanitized.pdf`;
  const sanitizedTargetPath = path.join(runtimePaths.sanitizedDir, sanitizedFileName);

  let sanitizationStatus = "needs_review";
  let readyForSummary = false;
  let assetError = createStandardError({
    code: "SANITIZE_PENDING",
    stage,
    message: "Sanitization has not been executed yet",
    fatal: false,
    retryable: false,
  });

  let pageCount = 0;
  let watermarkHits = [];

  if (fs.existsSync(rawTargetPath)) {
    const redactResult = runPythonRedaction({
      rootDir,
      inputPath: rawTargetPath,
      outputPath: sanitizedTargetPath,
      sanitizeConfig: env.sanitize,
    });

    if (redactResult.ok && redactResult.status === "completed") {
      sanitizationStatus = "completed";
      readyForSummary = !shouldMarkNeedsReview;
      assetError = null;
      pageCount = Number(redactResult.page_count || 0);
      watermarkHits = Array.isArray(redactResult.watermark_hits) ? redactResult.watermark_hits : [];
      if (Array.isArray(redactResult.warnings) && redactResult.warnings.length > 0) {
        warnings.push(...redactResult.warnings);
      }
      if (shouldMarkNeedsReview) {
        logger.warn(stage, "PDF redaction completed but candidate still requires manual review", {
          ticker: candidate.ticker,
          jobId: `${candidate.ticker}-${sourceReportId}`,
        });
      } else {
        logger.info(stage, "PDF redaction completed", {
          ticker: candidate.ticker,
          jobId: `${candidate.ticker}-${sourceReportId}`,
        });
      }
    } else if (redactResult.ok && redactResult.status === "needs_review") {
      sanitizationStatus = "needs_review";
      readyForSummary = false;
      pageCount = Number(redactResult.page_count || 0);
      watermarkHits = Array.isArray(redactResult.watermark_hits) ? redactResult.watermark_hits : [];
      assetError = createStandardError({
        code: "SANITIZE_NEEDS_REVIEW",
        stage,
        message: "Redaction completed but no reliable sensitive-hit found; manual review required",
        fatal: false,
        retryable: false,
        detail: {
          warnings: redactResult.warnings || [],
        },
      });
      logger.warn(stage, assetError.message, { ticker: candidate.ticker, jobId: `${candidate.ticker}-${sourceReportId}` });
    } else if (env.feature.unsafeSanitizePassthrough) {
      safeCopyFile(rawTargetPath, sanitizedTargetPath);
      sanitizationStatus = "completed";
      readyForSummary = true;
      pageCount = 0;
      watermarkHits = [];
      assetError = null;
      warnings.push(
        "UNSAFE_SANITIZE_PASSTHROUGH is enabled because redaction engine failed. This output is not privacy-safe."
      );
      logger.warn(stage, "Unsafe sanitize passthrough enabled after redaction failure", {
        ticker: candidate.ticker,
        jobId: `${candidate.ticker}-${sourceReportId}`,
      });
    } else {
      assetError = createStandardError({
        code: "SANITIZE_FAILED",
        stage,
        message: redactResult.error || "PDF redaction failed",
        fatal: false,
        retryable: true,
        detail: {
          stderr: redactResult.stderr || "",
        },
      });
      logger.error(stage, assetError.message, {
        ticker: candidate.ticker,
        jobId: `${candidate.ticker}-${sourceReportId}`,
        errorCode: assetError.code,
      });
    }
  }

  const sanitizedAsset = {
    run_id: runContext.runId,
    source_report_id: sourceReportId,
    ticker: record.ticker,
    name: record.name || record.ticker,
    section: record.section || "其他",
    raw_pdf_path: path.relative(rootDir, rawTargetPath).replaceAll("\\", "/"),
    sanitized_pdf_path:
      sanitizationStatus === "completed"
        ? path.relative(rootDir, sanitizedTargetPath).replaceAll("\\", "/")
        : "",
    page_count: pageCount,
    file_sha256: sanitizationStatus === "completed" ? sha256File(sanitizedTargetPath) : "",
    watermark_hits: watermarkHits,
    sanitization_status: sanitizationStatus,
    ready_for_summary: readyForSummary,
    broker,
    upload_at: uploadAt,
    is_new: Boolean(isNew),
    error: assetError,
  };
  sanitizedAssets.push(sanitizedAsset);

  return { reportCandidates, sanitizedAssets, errors, warnings };
}

module.exports = {
  runAcquisition,
};
