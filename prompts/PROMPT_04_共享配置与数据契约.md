# PROMPT 04 - 共享配置与数据契约

## 角色
本文件是 `Kanyanbao` 项目的单一事实来源。总控与所有子代理都必须遵守本文件中的配置命名、目录约定、状态枚举和对象契约。

## 通用默认值
- 运行时区：`Asia/Shanghai`
- 输出语言：`中文摘要 + 英文原始关键字段`
- 7 日窗口：`[run_date-6, run_date]`
- `【新增】` 窗口：`[run_date-1, run_date]`
- 板块顺序：`科技 ->  制造 -> 加密 ->消费 -> 医药 -> 其他`
- 缺失评级：`N/A`
- 缺失目标价：`N/A`
- 缺失摘要内容：`未提及`

## 目录约定
- `watchlist.csv`
- `config/security_master.csv`
- `runtime/raw_reports/{run_date}/`
- `runtime/sanitized_reports/{run_date}/`
- `runtime/manifests/{run_date}/`
- `runtime/structured/{run_date}/`
- `runtime/published/{run_date}/`
- `runtime/logs/{run_date}.jsonl`

所有子代理都必须向上述目录写出结果，不得自行发明平行目录。

## 环境变量清单
### 看研报获取
- `KZQ_USERNAME`
- `KZQ_PASSWORD`
- `KZQ_LOGIN_URL`
- `KZQ_REPORT_HOME_URL`
- `DOWNLOAD_TIMEOUT_MS`
- `PDF_EXTRACT_TIMEOUT_MS`

### 脱敏
- `SANITIZE_ENTITY_NAMES`
- `SANITIZE_PERSON_NAMES`
- `SANITIZE_EXTRA_PATTERNS`

### 翻译与总结
- `GOOGLE_TRANSLATE_ENDPOINT`
- `GOOGLE_TRANSLATE_API_KEY`
- `SUMMARY_API_BASE_URL`
- `SUMMARY_API_KEY`
- `SUMMARY_MODEL`
- `MAX_SUMMARY_INPUT_TOKENS`
- `MAX_SUMMARY_OUTPUT_TOKENS`
- `MAX_LLM_CHUNKS_PER_REPORT`
- `DAILY_LLM_TOKEN_BUDGET`

### 存储与分发
- `STORAGE_ENDPOINT`
- `STORAGE_REGION`
- `STORAGE_BUCKET`
- `STORAGE_ACCESS_KEY`
- `STORAGE_SECRET_KEY`
- `STORAGE_PREFIX`
- `SIGNED_URL_TTL_SECONDS`
- `SHORTLINK_BASE_URL`
- `SHORTLINK_SIGNING_KEY`
- `SHORTLINK_CODE_LENGTH`
- `FEISHU_WEBHOOK_URL`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`

## 时间与命名规范
- `run_date` 使用 `YYYY-MM-DD`。
- `run_id` 推荐格式：`kanyanbao-{run_date}-{HHmmss}`。
- 所有时间戳必须带时区偏移，例如 `2026-03-24T08:30:00+08:00`。
- 文件编码统一使用 `UTF-8`。
- PDF 文件命名：
  - 原始件：`{run_date}_{ticker}_{source_report_id}_raw.pdf`
  - 脱敏件：`{run_date}_{ticker}_{source_report_id}_sanitized.pdf`

## 状态枚举
- `acquisition_status`：`pending | completed | failed | needs_review | skipped`
- `sanitization_status`：`pending | completed | failed | needs_review`
- `summary_status`：`pending | completed | failed | needs_review`
- `link_status`：`not_created | signed | shortened | failed | expired`
- `delivery_status`：`draft | ready | blocked | sent | failed`
- `matched_by`：`ticker_exact | alias_match | manual_required`

## 标准错误对象

```json
{
  "code": "DOWNLOAD_TIMEOUT",
  "stage": "acquisition",
  "message": "download timed out after 60000ms",
  "fatal": false,
  "retryable": true,
  "detail": {}
}
```

要求：
- 所有失败项都必须返回标准错误对象。
- `fatal = true` 表示阻断整批自动发布。
- `retryable = true` 表示允许总控补试或恢复批次继续处理。

## 核心对象契约
### ReportCandidate

```json
{
  "run_id": "kanyanbao-2026-03-24-083000",
  "source": "kanzhiqiu",
  "source_report_id": "42970939",
  "title": "Apple: AI iPhone cycle ahead",
  "broker": "Goldman Sachs",
  "ticker": "AAPL",
  "name": "Apple",
  "section": "科技",
  "upload_at": "2026-03-24T07:12:00+08:00",
  "is_new": true,
  "matched_by": "ticker_exact",
  "page_url": "https://www.kanzhiqiu.com/...",
  "download_url": "https://www.kanzhiqiu.com/imageserver/report/download.htm?id=42970939",
  "raw_pdf_path": "runtime/raw_reports/2026-03-24/2026-03-24_AAPL_42970939_raw.pdf",
  "acquisition_status": "completed",
  "error": null
}
```

### SanitizedReportAsset

```json
{
  "run_id": "kanyanbao-2026-03-24-083000",
  "source_report_id": "42970939",
  "ticker": "AAPL",
  "name": "Apple",
  "section": "科技",
  "raw_pdf_path": "runtime/raw_reports/2026-03-24/2026-03-24_AAPL_42970939_raw.pdf",
  "sanitized_pdf_path": "runtime/sanitized_reports/2026-03-24/2026-03-24_AAPL_42970939_sanitized.pdf",
  "page_count": 32,
  "file_sha256": "string",
  "watermark_hits": [
    {
      "page": 1,
      "rule_id": "fixed_prefix",
      "text": "本报告仅供"
    }
  ],
  "sanitization_status": "completed",
  "ready_for_summary": true,
  "error": null
}
```

### SummaryRecord

```json
{
  "run_id": "kanyanbao-2026-03-24-083000",
  "no": 1,
  "section": "科技",
  "name": "Apple",
  "ticker": "AAPL",
  "security": "Apple Inc.",
  "rating": "Buy",
  "pt": "$240",
  "broker": "Goldman Sachs",
  "upload_at": "2026-03-24T07:12:00+08:00",
  "is_new": true,
  "source_report_id": "42970939",
  "sanitized_pdf_path": "runtime/sanitized_reports/2026-03-24/2026-03-24_AAPL_42970939_sanitized.pdf",
  "short_link": "SHORT_LINK_PLACEHOLDER",
  "summary_bullets": [
    "核心结论：...",
    "评级/目标价：...",
    "驱动因素：...",
    "财务预测：...",
    "风险点：...",
    "重要数字：..."
  ],
  "summary_status": "completed",
  "review_required": false,
  "error": null
}
```

### DailyDigest

```json
{
  "run_date": "2026-03-24",
  "timezone": "Asia/Shanghai",
  "total_reports": 12,
  "new_reports": 5,
  "sections": [
    {
      "section": "科技",
      "count": 6,
      "items": []
    }
  ],
  "markdown_path": "runtime/published/2026-03-24/daily_digest.md",
  "generated_at": "2026-03-24T08:45:00+08:00"
}
```

### DeliveryPayload

```json
{
  "run_date": "2026-03-24",
  "title": "Kanyanbao 美股研报日报 | 2026-03-24",
  "markdown_body": "string",
  "feishu_cards": [],
  "delivery_status": "ready",
  "warnings": []
}
```

## 日志字段
日志格式统一为 JSON Lines，每行至少包含：
- `timestamp`
- `run_id`
- `stage`
- `job_id`
- `ticker`
- `status`
- `message`
- `error_code`

说明：
- `job_id` 推荐格式：`{ticker}-{source_report_id}`。
- 没有具体 `ticker` 时可写空字符串，但字段必须存在。

## 输出一致性要求
- `SummaryRecord.section` 必须沿用上游板块值。
- `DailyDigest.sections[].items` 必须来自 `SummaryRecord[]`，不能另造结构。
- `DeliveryPayload.markdown_body` 必须来自最终 `daily_digest.md`，不能和文件内容不一致。

## 完成标准
- 总控与 3 个子代理在任何时候都不需要重新决定字段名、目录、状态值、错误对象和默认值。
- 实现者只要遵守本文件，就能完成跨阶段数据交接而不引入格式漂移。
