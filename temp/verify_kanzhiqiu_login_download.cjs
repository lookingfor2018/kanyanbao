const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const LOGIN_URL = "https://www.kanzhiqiu.com/user/login.htm";
const REPORT_HOME_URL = "https://www.kanzhiqiu.com/newreport/reportHome.htm";
const USERNAME = process.env.KZQ_USERNAME || "13917257504";
const PASSWORD = process.env.KZQ_PASSWORD || "";

async function safeJson(response) {
  try {
    return await response.json();
  } catch (err) {
    return {
      parseError: String(err),
      status: response.status(),
      url: response.url(),
      text: await response.text().catch(() => ""),
    };
  }
}

function parseFilenameFromContentDisposition(disposition) {
  if (!disposition) {
    return "";
  }
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match && utf8Match[1]) {
    return decodeURIComponent(utf8Match[1]).replace(/[\\/:*?"<>|]/g, "_");
  }
  const basicMatch = disposition.match(/filename="?([^";]+)"?/i);
  if (basicMatch && basicMatch[1]) {
    return basicMatch[1].replace(/[\\/:*?"<>|]/g, "_");
  }
  return "";
}

function extractReportIdFromHref(href) {
  if (!href) {
    return 0;
  }
  try {
    const absolute = new URL(href, REPORT_HOME_URL).toString();
    const id = new URL(absolute).searchParams.get("id") || "";
    const parsed = Number.parseInt(id, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch (_err) {
    return 0;
  }
}

async function run() {
  const baseDir = __dirname;
  const artifactsDir = path.join(baseDir, "artifacts");
  const downloadsDir = path.join(baseDir, "downloads");
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.mkdirSync(downloadsDir, { recursive: true });

  const result = {
    startedAt: new Date().toISOString(),
    loginUrl: LOGIN_URL,
    reportHomeUrl: REPORT_HOME_URL,
    loginCheckResponse: null,
    toLoginResponse: null,
    finalUrl: "",
    pageTitle: "",
    reportPageTitle: "",
    reportPageUrl: "",
    loginSuccessLikely: false,
    download: {
      attempted: false,
      success: false,
      detail: "",
      filePath: "",
      candidateLinksFound: 0,
      selectedHref: "",
      selectedReportId: 0,
    },
    errors: [],
  };

  const browser = await chromium.launch({
    headless: true,
  });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  page.on("response", async (response) => {
    const url = response.url();
    try {
      if (url.includes("/user/toLoginCheck.json")) {
        result.loginCheckResponse = await safeJson(response);
      }
      if (url.includes("/user/toLogin.json")) {
        result.toLoginResponse = await safeJson(response);
      }
    } catch (err) {
      result.errors.push(`response hook error: ${String(err)}`);
    }
  });

  try {
    if (!PASSWORD) {
      throw new Error("KZQ_PASSWORD is empty");
    }

    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector('input[name="username_f"]', { timeout: 30000 });

    await page.fill('input[name="username_f"]', USERNAME);
    await page.fill('input[name="password_f"]', PASSWORD);

    await page.click("#agree_checkbox", { force: true });
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(artifactsDir, "before_login_click.png"),
      fullPage: true,
    });

    await page.click('textarea[name="btn_submit"]', { force: true });

    await page.waitForTimeout(8000);
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});

    result.finalUrl = page.url();
    result.pageTitle = await page.title();
    result.loginSuccessLikely =
      !result.finalUrl.includes("/user/login.htm") && !result.finalUrl.includes("/user/login");

    await page.screenshot({
      path: path.join(artifactsDir, "after_login_attempt.png"),
      fullPage: true,
    });

    const htmlAfterLogin = await page.content();
    fs.writeFileSync(path.join(artifactsDir, "after_login_attempt.html"), htmlAfterLogin, "utf-8");

    if (result.loginSuccessLikely) {
      await page.goto(REPORT_HOME_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(5000);

      result.reportPageUrl = page.url();
      result.reportPageTitle = await page.title();

      await page.screenshot({
        path: path.join(artifactsDir, "report_home.png"),
        fullPage: true,
      });

      fs.writeFileSync(path.join(artifactsDir, "report_home.html"), await page.content(), "utf-8");

      const candidates = await page.$$eval(
        'a.down[href*="/imageserver/report/download.htm"], a[href*="/imageserver/report/download.htm"]',
        (anchors) =>
          anchors.map((a) => ({
            href: a.getAttribute("href") || "",
            text: (a.textContent || "").trim(),
            className: a.className || "",
          }))
      );

      const rankedCandidates = candidates
        .map((item) => ({
          ...item,
          reportId: extractReportIdFromHref(item.href),
        }))
        .filter((item) => item.href)
        .sort((a, b) => {
          if (b.reportId !== a.reportId) {
            return b.reportId - a.reportId;
          }
          return b.href.localeCompare(a.href);
        });

      result.download.candidateLinksFound = rankedCandidates.length;
      fs.writeFileSync(
        path.join(artifactsDir, "download_candidates.json"),
        JSON.stringify(rankedCandidates, null, 2),
        "utf-8"
      );

      if (rankedCandidates.length > 0) {
        result.download.attempted = true;
        const selected = rankedCandidates[0];
        const absoluteUrl = new URL(selected.href, REPORT_HOME_URL).toString();
        result.download.selectedHref = absoluteUrl;
        result.download.selectedReportId = selected.reportId;

        for (const fileName of fs.readdirSync(downloadsDir)) {
          if (fileName.toLowerCase().endsWith(".pdf")) {
            fs.rmSync(path.join(downloadsDir, fileName), { force: true });
          }
        }

        const response = await context.request.get(absoluteUrl, {
          timeout: 60000,
          failOnStatusCode: false,
          headers: {
            Referer: REPORT_HOME_URL,
          },
        });

        const headers = response.headers();
        const contentType = String(headers["content-type"] || "");
        const contentDisposition = String(headers["content-disposition"] || "");
        const body = await response.body();
        const isPdf = body.slice(0, 4).toString("utf8") === "%PDF" || contentType.toLowerCase().includes("pdf");

        if (response.ok() && isPdf) {
          const nameFromHeader = parseFilenameFromContentDisposition(contentDisposition);
          const reportId = new URL(absoluteUrl).searchParams.get("id") || Date.now().toString();
          const fallbackName = `report_${reportId}.pdf`;
          const fileName = nameFromHeader || fallbackName;
          const shortName = fileName.length > 80 ? fallbackName : fileName;
          const savePath = path.join(downloadsDir, shortName.endsWith(".pdf") ? shortName : `${shortName}.pdf`);
          fs.writeFileSync(savePath, body);
          result.download.success = true;
          result.download.filePath = savePath;
          result.download.detail = `downloaded report (max id=${selected.reportId}) from ${absoluteUrl}`;
        } else {
          const debugPath = path.join(downloadsDir, `download_debug_${Date.now()}.txt`);
          fs.writeFileSync(debugPath, body);
          result.download.detail = `download request status=${response.status()} content-type=${contentType} url=${absoluteUrl} debug=${debugPath}`;
        }
      } else {
        result.download.detail = "no report download links found on reportHome page";
      }
    } else {
      result.download.detail = "login not successful, skipped report download step";
    }
  } catch (err) {
    result.errors.push(`runtime error: ${String(err)}`);
    try {
      await page.screenshot({
        path: path.join(artifactsDir, "runtime_error.png"),
        fullPage: true,
      });
    } catch (sErr) {
      result.errors.push(`screenshot error: ${String(sErr)}`);
    }
  } finally {
    result.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(artifactsDir, "verify_result.json"), JSON.stringify(result, null, 2), "utf-8");
    await context.close();
    await browser.close();
  }
}

run().catch((err) => {
  const out = {
    fatal: String(err),
    at: new Date().toISOString(),
  };
  const target = path.join(__dirname, "artifacts", "verify_result_fatal.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(out, null, 2), "utf-8");
  process.exitCode = 1;
});
