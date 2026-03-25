#!/usr/bin/env node
const { runOrchestration } = require("../orchestrator/run");

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--run-date") {
      parsed.runDate = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--mode") {
      parsed.mode = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--force-tickers") {
      parsed.forceTickers = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--notes") {
      parsed.notes = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--skip-push") {
      parsed.skipPush = true;
      continue;
    }
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runOrchestration({
    rootDir: process.cwd(),
    runDate: args.runDate,
    mode: args.mode,
    forceTickers: args.forceTickers,
    notes: args.notes,
    skipPush: Boolean(args.skipPush),
  });

  const summary = {
    run_id: result.runContext.runId,
    run_date: result.runContext.runDate,
    mode: result.runContext.mode,
    candidates: result.acquisitionResult.reportCandidates.length,
    sanitized_ready: result.acquisitionResult.sanitizedAssets.filter((item) => item.ready_for_summary).length,
    summary_records: result.publishResult.summaryRecordsWithLinks.length,
    delivery_status: result.publishResult.deliveryPayload.delivery_status,
    acceptance_decision: result.acceptanceResult.decision,
    published_markdown: result.publishResult.dailyDigest.markdown_path,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});

