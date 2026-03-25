function buildAcceptanceReport({
  runContext,
  scenarioResults,
  decision,
  deliveryStatus,
  blockReasons,
  manualReviewQueue,
  recoveryQueue,
}) {
  const lines = [
    `# Kanyanbao 验收报告 | ${runContext.runDate}`,
    "",
    `run_id: ${runContext.runId}`,
    `mode: ${runContext.mode}`,
    `timezone: ${runContext.timezone}`,
    `delivery_status: ${deliveryStatus}`,
    `自动推送结论: ${decision}`,
    "",
    "## 8 个核心场景结果",
    "",
  ];

  scenarioResults.forEach((scenario, index) => {
    lines.push(`${index + 1}. ${scenario.name}：${scenario.pass ? "PASS" : "FAIL"} - ${scenario.detail}`);
  });

  lines.push("");
  lines.push("## 阻断原因");
  lines.push("");
  if (blockReasons.length === 0) {
    lines.push("- 无");
  } else {
    blockReasons.forEach((reason) => lines.push(`- ${reason}`));
  }

  lines.push("");
  lines.push("## 人工复核项");
  lines.push("");
  if (manualReviewQueue.length === 0) {
    lines.push("- 无");
  } else {
    manualReviewQueue.forEach((item) => lines.push(`- ${item.reason}: ${item.ticker || "N/A"} ${item.source_report_id || ""}`));
  }

  lines.push("");
  lines.push("## 恢复建议");
  lines.push("");
  if (recoveryQueue.length === 0) {
    lines.push("- 无");
  } else {
    recoveryQueue.forEach((item) => lines.push(`- ${item.reason}: ${item.ticker || "N/A"} ${item.source_report_id || ""}`));
  }
  lines.push("");
  return lines.join("\n");
}

function runAcceptance({
  runContext,
  acquisitionResult,
  summaryResult,
  publishResult,
}) {
  const candidates = acquisitionResult.reportCandidates || [];
  const assets = acquisitionResult.sanitizedAssets || [];
  const summaryRecords = summaryResult.summaryRecords || [];
  const linkedRecords = publishResult.summaryRecordsWithLinks || [];

  const scenario1Pass = candidates.length > 0;
  const scenario2Pass = candidates.every((item) => Boolean(item.upload_at));
  const scenario3Pass = summaryRecords.every((item) => Boolean(item.section));
  const scenario4Pass = assets.every((item) => item.sanitization_status === "completed");
  const scenario5Pass =
    summaryRecords.length === 0 ? true : summaryRecords.every((item) => (item.summary_bullets || []).length === 6);
  const scenario6Pass =
    linkedRecords.length > 0 && linkedRecords.every((item) => item.link_status === "shortened");
  const scenario7Pass =
    linkedRecords.length === 0 ? true : !linkedRecords.some((item) => ["failed", "expired"].includes(item.link_status));
  const scenario8Pass = Array.isArray(publishResult.deliveryPayload.feishu_cards);

  const scenarioResults = [
    { name: "登录与下载", pass: scenario1Pass, detail: `候选报告数=${candidates.length}` },
    { name: "7 日筛选与新增标记", pass: scenario2Pass, detail: "upload_at 字段完整性检查" },
    { name: "板块归类与排序", pass: scenario3Pass, detail: "section 字段完整性检查" },
    { name: "脱敏有效性", pass: scenario4Pass, detail: "仅 completed 才可自动放行" },
    { name: "翻译与总结", pass: scenario5Pass, detail: "每篇 6 条摘要检查" },
    { name: "对象存储/签名/短链", pass: scenario6Pass, detail: "link_status=shortened 检查" },
    { name: "链接异常处理", pass: scenario7Pass, detail: "failed/expired 状态检查" },
    { name: "飞书文本与卡片", pass: scenario8Pass, detail: "feishu_cards 结构检查" },
  ];

  const manualReviewQueue = [];
  const recoveryQueue = [];
  const blockReasons = [];

  candidates
    .filter((item) => item.acquisition_status === "needs_review")
    .forEach((item) =>
      manualReviewQueue.push({
        stage: "acquisition",
        reason: item.error?.message || "acquisition needs review",
        ticker: item.ticker,
        source_report_id: item.source_report_id,
      })
    );

  assets
    .filter((item) => item.sanitization_status !== "completed")
    .forEach((item) =>
      manualReviewQueue.push({
        stage: "sanitization",
        reason: item.error?.message || "sanitization failed",
        ticker: item.ticker,
        source_report_id: item.source_report_id,
      })
    );

  linkedRecords
    .filter((item) => item.review_required || item.link_status !== "shortened")
    .forEach((item) =>
      manualReviewQueue.push({
        stage: "publish",
        reason: item.review_required ? "summary review required" : `link_status=${item.link_status}`,
        ticker: item.ticker,
        source_report_id: item.source_report_id,
      })
    );

  (acquisitionResult.errors || [])
    .filter((item) => item.retryable)
    .forEach((item) =>
      recoveryQueue.push({
        stage: item.stage || "acquisition",
        reason: item.message,
        ticker: "",
        source_report_id: "",
      })
    );

  if (publishResult.deliveryPayload.delivery_status !== "ready" && publishResult.deliveryPayload.delivery_status !== "sent") {
    blockReasons.push(`delivery_status=${publishResult.deliveryPayload.delivery_status}`);
  }
  if (!scenario4Pass) {
    blockReasons.push("存在未完成脱敏报告");
  }
  if (!scenario6Pass) {
    blockReasons.push("存在未就绪短链接");
  }

  let decision = "可自动推送";
  if (blockReasons.length > 0) {
    decision = "阻断";
  } else if (manualReviewQueue.length > 0) {
    decision = "需人工复核";
  }

  const acceptanceReportMarkdown = buildAcceptanceReport({
    runContext,
    scenarioResults,
    decision,
    deliveryStatus: publishResult.deliveryPayload.delivery_status,
    blockReasons,
    manualReviewQueue,
    recoveryQueue,
  });

  return {
    scenarioResults,
    decision,
    blockReasons,
    manualReviewQueue,
    recoveryQueue,
    acceptanceReportMarkdown,
  };
}

module.exports = {
  runAcceptance,
};
