# Kanyanbao

美股研报自动化处理实现（总控 + 三阶段子流程）：

1. 报告获取与预处理（支持本地样本接入）
2. PDF 脱敏（PyMuPDF 真正红框遮罩 + 元数据清理）
3. 排版与分发（对象存储上传、签名 URL、短链生成、可访问性校验、飞书推送）

## 快速开始

```bash
npm install
python -m pip install pymupdf
cp .env.example .env
```

填写 `.env` 后执行：

```bash
npm run orchestrate -- --mode manual --skip-push
```

常用参数：

- `--run-date YYYY-MM-DD`
- `--mode manual|scheduled|recovery`
- `--force-tickers AAPL,NVDA`
- `--skip-push`

## 输出目录

- `runtime/manifests/{run_date}/`
- `runtime/structured/{run_date}/`
- `runtime/published/{run_date}/`
- `runtime/logs/{run_date}.jsonl`
- `dist/`（Pages 站点产物）

## 对象存储与短链

当前支持：

- `S3 兼容对象存储` 上传脱敏 PDF
- 生成 `GetObject` 签名 URL
- 生成短链（默认 `static_redirect`，也支持 `api`）
- 链接可访问性校验（签名 URL 与短链文件）

关键变量：

- `STORAGE_ENDPOINT`
- `STORAGE_BUCKET`
- `STORAGE_ACCESS_KEY`
- `STORAGE_SECRET_KEY`
- `SHORTLINK_PROVIDER`
- `SHORTLINK_BASE_URL`
- `SHORTLINK_SIGNING_KEY`

## 飞书通知

本地/CI 都复用同一逻辑：

- 先生成 `runtime/published/{run_date}/delivery_payload.json`
- 再执行 `npm run notify` 发送最近批次

需要在 `.env` 或 GitHub Secrets 配置：

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_CHAT_ID`

也支持 webhook 模式：`FEISHU_WEBHOOK_URL`。

## GitHub Actions / Pages

见文档：[docs/github-setup.md](/d:/vscode/kanyanbao/docs/github-setup.md)
