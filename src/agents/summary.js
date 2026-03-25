const { SECTION_ORDER, SHORT_LINK_PLACEHOLDER } = require("../config/contracts");

function buildDefaultBullets() {
  return [
    "核心结论：未提及",
    "评级/目标价：未提及",
    "驱动因素：未提及",
    "财务预测：未提及",
    "风险点：未提及",
    "重要数字：未提及",
  ];
}

function compareBySectionAndName(a, b) {
  const aIndex = SECTION_ORDER.indexOf(a.section);
  const bIndex = SECTION_ORDER.indexOf(b.section);
  const sectionDiff = (aIndex < 0 ? 999 : aIndex) - (bIndex < 0 ? 999 : bIndex);
  if (sectionDiff !== 0) {
    return sectionDiff;
  }
  const aKey = `${a.name || a.ticker || ""}-${a.ticker || ""}`;
  const bKey = `${b.name || b.ticker || ""}-${b.ticker || ""}`;
  return aKey.localeCompare(bKey, "en");
}

function renderSummaryTable(records) {
  const lines = [
    "|no|section|name|ticker|broker|rating|pt|eps|link|",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  for (const row of records) {
    lines.push(
      `|${row.no}|${row.section}|${row.name}|${row.ticker}|${row.broker}|${row.rating}|${row.pt}|N/A|${row.short_link}|`
    );
  }
  return `${lines.join("\n")}\n`;
}

function renderSummariesBySection(records) {
  if (records.length === 0) {
    return "本批次没有可进入摘要阶段的脱敏报告。\n";
  }
  const lines = [];
  for (const section of SECTION_ORDER) {
    const sectionRows = records.filter((item) => item.section === section);
    if (sectionRows.length === 0) {
      continue;
    }
    lines.push(`## ${section}`);
    lines.push("");
    sectionRows.forEach((row, index) => {
      const prefix = row.is_new ? "【新增】" : "";
      lines.push(
        `${index + 1}. ${prefix}${row.name} - ${row.ticker} | ${row.rating} | PT ${row.pt} | [报告链接](${row.short_link})`
      );
      row.summary_bullets.forEach((bullet) => {
        lines.push(`   - ${bullet}`);
      });
      lines.push("");
    });
  }
  return `${lines.join("\n").trim()}\n`;
}

async function runSummary({ runContext, sanitizedAssets, logger }) {
  const stage = "summary";
  const readyAssets = sanitizedAssets.filter(
    (item) => item.sanitization_status === "completed" && item.ready_for_summary === true
  );

  const summaryRecords = readyAssets
    .map((asset, index) => ({
      run_id: runContext.runId,
      no: index + 1,
      section: asset.section || "其他",
      name: asset.name || asset.ticker || "N/A",
      ticker: asset.ticker || "N/A",
      security: asset.name || asset.ticker || "N/A",
      rating: "N/A",
      pt: "N/A",
      broker: asset.broker || "N/A",
      upload_at: asset.upload_at || "N/A",
      is_new: Boolean(asset.is_new),
      summary_bullets: buildDefaultBullets(),
      source_report_id: asset.source_report_id,
      sanitized_pdf_path: asset.sanitized_pdf_path,
      short_link: SHORT_LINK_PLACEHOLDER,
      summary_status: "completed",
      review_required: false,
      error: null,
    }))
    .sort(compareBySectionAndName)
    .map((item, index) => ({ ...item, no: index + 1 }));

  if (summaryRecords.length === 0) {
    logger.warn(stage, "No sanitized assets ready for summary generation");
  } else {
    logger.info(stage, `Generated ${summaryRecords.length} summary records`, {
      jobId: "batch",
    });
  }

  return {
    summaryRecords,
    summaryTableMarkdown: renderSummaryTable(summaryRecords),
    reportSummariesMarkdown: renderSummariesBySection(summaryRecords),
    warnings:
      summaryRecords.length > 0
        ? ["Summary records are currently template-based; you can enable manual review policy if needed."]
        : [],
  };
}

module.exports = {
  runSummary,
};
