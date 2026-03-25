#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { loadEnv } = require("../config/load-env");
const { sendFeishuDigest } = require("../channels/feishu");
const { writeJson } = require("../shared/fs-utils");

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--run-date") {
      parsed.runDate = argv[i + 1];
      i += 1;
    }
  }
  return parsed;
}

function findLatestRunDate(publishedRoot) {
  if (!fs.existsSync(publishedRoot)) {
    return "";
  }
  return fs
    .readdirSync(publishedRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse()[0];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const env = loadEnv(rootDir);
  const publishedRoot = path.join(rootDir, "runtime", "published");
  const runDate = args.runDate || findLatestRunDate(publishedRoot);
  if (!runDate) {
    throw new Error("No published batch found under runtime/published");
  }

  const payloadPath = path.join(publishedRoot, runDate, "delivery_payload.json");
  if (!fs.existsSync(payloadPath)) {
    throw new Error(`Missing delivery payload: ${payloadPath}`);
  }

  const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
  if (payload.delivery_status !== "ready" && payload.delivery_status !== "sent") {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          run_date: runDate,
          skipped: true,
          reason: `delivery_status=${payload.delivery_status}`,
        },
        null,
        2
      )
    );
    return;
  }

  if (!env.feishu.enablePush) {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          run_date: runDate,
          skipped: true,
          reason: "FEISHU_ENABLE_PUSH=false",
        },
        null,
        2
      )
    );
    return;
  }

  const result = await sendFeishuDigest({
    env,
    title: payload.title,
    markdownBody: payload.markdown_body,
  });
  if (result.ok) {
    payload.delivery_status = "sent";
  } else {
    payload.delivery_status = "failed";
    payload.warnings = [...(payload.warnings || []), result.detail];
  }
  writeJson(payloadPath, payload);

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        run_date: runDate,
        sent: result.ok,
        channel: result.channel,
        detail: result.detail,
        delivery_status: payload.delivery_status,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});

