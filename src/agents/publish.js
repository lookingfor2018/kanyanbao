const fs = require("fs");
const path = require("path");
const { SECTION_ORDER, SHORT_LINK_PLACEHOLDER } = require("../config/contracts");
const { sendFeishuDigest } = require("../channels/feishu");
const { formatIsoCst } = require("../shared/time");
const { markdownToSimpleHtml } = require("../shared/markdown");
const { isStorageConfigured, uploadPdfAndSignUrl } = require("../storage/s3-signed");
const { createShortlink, verifyStaticRedirectFile } = require("../shortlink/service");
const { verifyUrlAccessible } = require("../shared/url-verify");

function normalizeUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}

function renderDailyDigestMarkdown({ runDate, summaryRecords, summaryTableMarkdown, notes = [] }) {
  const totalReports = summaryRecords.length;
  const newReports = summaryRecords.filter((item) => item.is_new).length;
  const lines = [
    `# Kanyanbao 美股研报日报 | ${runDate}`,
    "",
    `更新时间：${formatIsoCst().replace("T", " ").slice(0, 19)} CST`,
    "覆盖范围：最近 7 个自然日",
    "新增标记：最近 2 个自然日上传的报告显示为【新增】",
    `总报告数：${totalReports}`,
    "",
    "## 概览表",
    "",
    summaryTableMarkdown.trim(),
    "",
  ];

  for (const section of SECTION_ORDER) {
    const sectionRows = summaryRecords.filter((item) => item.section === section);
    if (sectionRows.length === 0) {
      continue;
    }
    lines.push(`## ${section}`);
    lines.push("");
    sectionRows.forEach((row, index) => {
      const newTag = row.is_new ? "【新增】" : "";
      lines.push(
        `${index + 1}. ${newTag}${row.name} - ${row.ticker} | ${row.rating} | PT ${row.pt} | [报告链接](${row.short_link})`
      );
      row.summary_bullets.forEach((bullet) => lines.push(`   - ${bullet}`));
      lines.push("");
    });
  }

  lines.push("## 人工复核与失败项");
  lines.push("");
  const reviewItems = summaryRecords.filter(
    (item) => item.review_required || item.link_status === "failed" || item.link_status === "not_created"
  );
  if (reviewItems.length === 0 && notes.length === 0) {
    lines.push("- 无");
  } else {
    reviewItems.forEach((item) => {
      lines.push(`- ${item.name} (${item.ticker})：review_required=${item.review_required}, link_status=${item.link_status}`);
    });
    notes.forEach((note) => lines.push(`- ${note}`));
  }
  lines.push("");
  return `${lines.join("\n")}`;
}

function buildFeishuCards({ runDate, summaryRecords }) {
  const cards = [];
  const chunkSize = 20;
  for (let start = 0; start < summaryRecords.length; start += chunkSize) {
    const chunk = summaryRecords.slice(start, start + chunkSize);
    cards.push({
      title: `Kanyanbao 美股研报日报 | ${runDate} | ${start + 1}-${start + chunk.length}`,
      lines: chunk.map((item) => `${item.name} (${item.ticker}) ${item.rating} ${item.pt}`),
    });
  }
  return cards;
}

async function runPublish({
  rootDir,
  distPaths,
  env,
  runContext,
  summaryRecords,
  summaryTableMarkdown,
  reportSummariesMarkdown,
  skipPush,
  logger,
}) {
  const stage = "publish";
  const notes = [];
  const storageReady = isStorageConfigured(env);
  const runtimeShortlinkBase =
    normalizeUrl(env.shortlink.baseUrl) || normalizeUrl(env.siteBaseUrl);

  const envForShortlink = {
    ...env,
    shortlink: {
      ...env.shortlink,
      baseUrl: runtimeShortlinkBase,
    },
  };

  if (!storageReady) {
    notes.push("对象存储配置不完整，无法上传脱敏 PDF 并签名。");
  }
  if (!runtimeShortlinkBase) {
    notes.push("SHORTLINK_BASE_URL/SITE_BASE_URL 未配置，无法生成短链。");
  }

  const linkedRecords = [];
  for (const record of summaryRecords) {
    const next = {
      ...record,
      short_link: SHORT_LINK_PLACEHOLDER,
      link_status: "not_created",
      signed_url: "",
      storage_object_key: "",
    };

    const absoluteSanitizedPath = path.join(rootDir, record.sanitized_pdf_path || "");
    if (!record.sanitized_pdf_path || !absoluteSanitizedPath || !fs.existsSync(absoluteSanitizedPath)) {
      next.link_status = "failed";
      next.review_required = true;
      notes.push(`${record.ticker}-${record.source_report_id} 缺少脱敏 PDF，无法生成外链。`);
      linkedRecords.push(next);
      continue;
    }

    if (!storageReady) {
      next.link_status = "failed";
      next.review_required = true;
      linkedRecords.push(next);
      continue;
    }

    try {
      const storageResult = await uploadPdfAndSignUrl({
        env,
        runDate: runContext.runDate,
        localFilePath: absoluteSanitizedPath,
      });
      next.signed_url = storageResult.signed_url;
      next.storage_object_key = storageResult.object_key;
      next.link_status = "signed";

      if (env.feature.verifySignedUrl) {
        const verifySigned = await verifyUrlAccessible(storageResult.signed_url, {
          timeoutMs: env.feature.linkVerifyTimeoutMs,
          expectPdf: true,
        });
        if (!verifySigned.ok) {
          next.link_status = "failed";
          next.review_required = true;
          notes.push(
            `${record.ticker}-${record.source_report_id} 签名链接校验失败: ${verifySigned.error || verifySigned.status}`
          );
          linkedRecords.push(next);
          continue;
        }
      }

      const shortlinkResult = await createShortlink({
        env: envForShortlink,
        distRoot: distPaths.distRoot,
        runId: runContext.runId,
        ticker: record.ticker,
        sourceReportId: record.source_report_id,
        targetUrl: storageResult.signed_url,
        runDate: runContext.runDate,
      });
      if (!shortlinkResult.ok) {
        next.link_status = "failed";
        next.review_required = true;
        notes.push(
          `${record.ticker}-${record.source_report_id} 短链创建失败: ${shortlinkResult.error || "unknown"}`
        );
        linkedRecords.push(next);
        continue;
      }

      if (env.feature.verifyShortlink) {
        if (shortlinkResult.provider === "static_redirect") {
          const fileVerify = verifyStaticRedirectFile(shortlinkResult.file_path, storageResult.signed_url);
          if (!fileVerify.ok) {
            next.link_status = "failed";
            next.review_required = true;
            notes.push(`${record.ticker}-${record.source_report_id} 短链文件校验失败: ${fileVerify.detail}`);
            linkedRecords.push(next);
            continue;
          }
        } else if (shortlinkResult.provider === "api" && env.shortlink.verifyRemote) {
          const remoteVerify = await verifyUrlAccessible(shortlinkResult.short_url, {
            timeoutMs: env.feature.linkVerifyTimeoutMs,
            expectPdf: false,
          });
          if (!remoteVerify.ok) {
            next.link_status = "failed";
            next.review_required = true;
            notes.push(
              `${record.ticker}-${record.source_report_id} 短链远程可访问性校验失败: ${remoteVerify.error || remoteVerify.status}`
            );
            linkedRecords.push(next);
            continue;
          }
        }
      }

      next.short_link = shortlinkResult.short_url;
      next.link_status = "shortened";
      linkedRecords.push(next);
      logger.info(stage, "Signed URL and shortlink created", {
        ticker: next.ticker,
        jobId: `${next.ticker}-${next.source_report_id}`,
      });
    } catch (error) {
      next.link_status = "failed";
      next.review_required = true;
      notes.push(`${record.ticker}-${record.source_report_id} 链接阶段异常: ${String(error)}`);
      linkedRecords.push(next);
      logger.error(stage, String(error), {
        ticker: next.ticker,
        jobId: `${next.ticker}-${next.source_report_id}`,
        errorCode: "LINK_BUILD_FAILED",
      });
    }
  }

  const hasFailedLink = linkedRecords.some((item) => item.link_status !== "shortened");
  const hasReview = linkedRecords.some((item) => item.review_required);
  const deliveryStatus =
    linkedRecords.length === 0 || hasFailedLink || hasReview ? "blocked" : "ready";

  const dailyDigestMarkdown = renderDailyDigestMarkdown({
    runDate: runContext.runDate,
    summaryRecords: linkedRecords,
    summaryTableMarkdown,
    notes,
  });

  const dailyDigest = {
    run_date: runContext.runDate,
    timezone: runContext.timezone,
    total_reports: linkedRecords.length,
    new_reports: linkedRecords.filter((item) => item.is_new).length,
    sections: SECTION_ORDER.map((section) => ({
      section,
      count: linkedRecords.filter((item) => item.section === section).length,
      items: linkedRecords.filter((item) => item.section === section).map((item) => item.source_report_id),
    })).filter((item) => item.count > 0),
    markdown_path: `runtime/published/${runContext.runDate}/daily_digest.md`,
    generated_at: formatIsoCst(),
  };

  const deliveryPayload = {
    run_date: runContext.runDate,
    title: `Kanyanbao 美股研报日报 | ${runContext.runDate}`,
    markdown_body: dailyDigestMarkdown,
    feishu_cards: buildFeishuCards({ runDate: runContext.runDate, summaryRecords: linkedRecords }),
    delivery_status: deliveryStatus,
    warnings: notes,
  };

  if (skipPush) {
    logger.info(stage, "Skipping Feishu push due to --skip-push");
  } else if (!env.feishu.enablePush) {
    logger.info(stage, "Feishu push disabled by FEISHU_ENABLE_PUSH=false");
  } else if (deliveryPayload.delivery_status !== "ready") {
    logger.warn(stage, "Feishu push blocked because delivery_status is not ready", { jobId: "batch" });
  } else {
    const pushResult = await sendFeishuDigest({
      env,
      title: deliveryPayload.title,
      markdownBody: deliveryPayload.markdown_body,
    });
    if (pushResult.ok) {
      deliveryPayload.delivery_status = "sent";
      logger.info(stage, `Feishu push sent via ${pushResult.channel}`, { jobId: "batch" });
    } else {
      deliveryPayload.delivery_status = "failed";
      deliveryPayload.warnings.push(pushResult.detail);
      logger.error(stage, `Feishu push failed: ${pushResult.detail}`, { errorCode: "FEISHU_SEND_FAILED" });
    }
  }

  const batchTitle = `Kanyanbao 美股研报日报 | ${runContext.runDate}`;
  const batchHtml = markdownToSimpleHtml(dailyDigestMarkdown, batchTitle);
  const rootHtml = markdownToSimpleHtml(
    `${dailyDigestMarkdown}\n\n---\n最新批次：${runContext.runDate}\n`,
    "Kanyanbao 美股研报日报"
  );

  return {
    summaryRecordsWithLinks: linkedRecords,
    dailyDigest,
    deliveryPayload,
    dailyDigestMarkdown,
    reportSummariesMarkdown,
    batchHtml,
    rootHtml,
    distManifest: {
      run_date: runContext.runDate,
      generated_at: formatIsoCst(),
      total_reports: linkedRecords.length,
      delivery_status: deliveryPayload.delivery_status,
    },
  };
}

module.exports = {
  runPublish,
};
