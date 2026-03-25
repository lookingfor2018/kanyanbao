const path = require("path");
const dotenv = require("dotenv");

function toBool(value, fallback = false) {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return fallback;
}

function toList(value) {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }
  return value
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function loadEnv(rootDir = process.cwd()) {
  dotenv.config({ path: path.join(rootDir, ".env") });
  const env = process.env;

  return {
    runTimezone: env.RUN_TIMEZONE || "Asia/Shanghai",
    defaultRunMode: env.DEFAULT_RUN_MODE || "manual",
    siteBaseUrl: env.SITE_BASE_URL || "",
    kzq: {
      username: env.KZQ_USERNAME || "",
      password: env.KZQ_PASSWORD || "",
      loginUrl: env.KZQ_LOGIN_URL || "https://www.kanzhiqiu.com/user/login.htm",
      reportHomeUrl: env.KZQ_REPORT_HOME_URL || "https://www.kanzhiqiu.com/newreport/reportHome.htm",
      downloadTimeoutMs: toInt(env.DOWNLOAD_TIMEOUT_MS, 60000),
      pdfExtractTimeoutMs: toInt(env.PDF_EXTRACT_TIMEOUT_MS, 120000),
    },
    sanitize: {
      entityNames: toList(env.SANITIZE_ENTITY_NAMES),
      personNames: toList(env.SANITIZE_PERSON_NAMES),
      extraPatterns: toList(env.SANITIZE_EXTRA_PATTERNS),
    },
    summary: {
      apiBaseUrl: env.SUMMARY_API_BASE_URL || "https://gmn.chuangzuoli.com",
      apiKey: env.SUMMARY_API_KEY || "",
      model: env.SUMMARY_MODEL || "gpt-5.3",
      googleEndpoint: env.GOOGLE_TRANSLATE_ENDPOINT || "",
      googleApiKey: env.GOOGLE_TRANSLATE_API_KEY || "",
      maxInputTokens: toInt(env.MAX_SUMMARY_INPUT_TOKENS, 17000),
      maxOutputTokens: toInt(env.MAX_SUMMARY_OUTPUT_TOKENS, 1800),
      maxChunksPerReport: toInt(env.MAX_LLM_CHUNKS_PER_REPORT, 6),
      dailyTokenBudget: toInt(env.DAILY_LLM_TOKEN_BUDGET, 500000),
    },
    storage: {
      endpoint: env.STORAGE_ENDPOINT || "",
      region: env.STORAGE_REGION || "",
      bucket: env.STORAGE_BUCKET || "",
      accessKey: env.STORAGE_ACCESS_KEY || "",
      secretKey: env.STORAGE_SECRET_KEY || "",
      prefix: env.STORAGE_PREFIX || "reports",
      signedUrlTtlSeconds: toInt(env.SIGNED_URL_TTL_SECONDS, 604800),
    },
    shortlink: {
      provider: env.SHORTLINK_PROVIDER || "static_redirect",
      baseUrl: env.SHORTLINK_BASE_URL || "",
      signingKey: env.SHORTLINK_SIGNING_KEY || "",
      codeLength: toInt(env.SHORTLINK_CODE_LENGTH, 8),
      apiEndpoint: env.SHORTLINK_API_ENDPOINT || "",
      apiToken: env.SHORTLINK_API_TOKEN || "",
      verifyRemote: toBool(env.SHORTLINK_VERIFY_REMOTE, false),
    },
    feishu: {
      enablePush: toBool(env.FEISHU_ENABLE_PUSH, false),
      webhookUrl: env.FEISHU_WEBHOOK_URL || "",
      chatId: env.FEISHU_CHAT_ID || "",
      appId: env.FEISHU_APP_ID || "",
      appSecret: env.FEISHU_APP_SECRET || "",
      verificationToken: env.FEISHU_VERIFICATION_TOKEN || "",
      encryptKey: env.FEISHU_ENCRYPT_KEY || "",
    },
    feature: {
      enableLiveAcquisition: toBool(env.ENABLE_LIVE_ACQUISITION, false),
      enableAcceptanceStrict: toBool(env.ENABLE_ACCEPTANCE_STRICT, false),
      unsafeSanitizePassthrough: toBool(env.UNSAFE_SANITIZE_PASSTHROUGH, false),
      verifySignedUrl: toBool(env.VERIFY_SIGNED_URL, true),
      verifyShortlink: toBool(env.VERIFY_SHORTLINK, true),
      linkVerifyTimeoutMs: toInt(env.LINK_VERIFY_TIMEOUT_MS, 15000),
    },
  };
}

module.exports = {
  loadEnv,
};
