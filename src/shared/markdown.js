function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function markdownToSimpleHtml(markdown, title) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: "Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif; margin: 24px; line-height: 1.6; color: #222; background: #f7f9fb; }
    .card { max-width: 980px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,.06); padding: 24px; }
    pre { white-space: pre-wrap; word-break: break-word; margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  </style>
</head>
<body>
  <main class="card">
    <pre>${escapeHtml(markdown)}</pre>
  </main>
</body>
</html>
`;
}

module.exports = {
  markdownToSimpleHtml,
};

