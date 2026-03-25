async function verifyUrlAccessible(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 15000);
  const expectPdf = Boolean(options.expectPdf);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: expectPdf ? { Range: "bytes=0-1023" } : {},
    });

    const contentType = String(response.headers.get("content-type") || "");
    let pdfHeader = "";
    if (expectPdf) {
      const buffer = Buffer.from(await response.arrayBuffer());
      pdfHeader = buffer.slice(0, 4).toString("utf8");
    }

    const looksLikePdf = !expectPdf || contentType.toLowerCase().includes("pdf") || pdfHeader === "%PDF";
    return {
      ok: response.ok && looksLikePdf,
      status: response.status,
      finalUrl: response.url,
      contentType,
      looksLikePdf,
      error: response.ok ? "" : `status ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      contentType: "",
      looksLikePdf: !expectPdf,
      error: String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  verifyUrlAccessible,
};

