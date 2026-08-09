# Kanyanbao 验收报告 | 2026-08-09

run_id: kanyanbao-2026-08-09-140513
mode: scheduled
timezone: Asia/Shanghai
delivery_status: blocked
自动推送结论: 阻断

## 8 个核心场景结果

1. 登录与下载：PASS - 候选报告数=1
2. 7 日筛选与新增标记：PASS - upload_at 字段完整性检查
3. 板块归类与排序：PASS - section 字段完整性检查
4. 脱敏有效性：FAIL - 仅 completed 才可自动放行
5. 翻译与总结：PASS - 每篇 6 条摘要检查
6. 对象存储/签名/短链：FAIL - link_status=shortened 检查
7. 链接异常处理：PASS - failed/expired 状态检查
8. 飞书文本与卡片：PASS - feishu_cards 结构检查

## 阻断原因

- delivery_status=blocked
- 存在未完成脱敏报告
- 存在未就绪短链接

## 人工复核项

- redaction stdout is not json: warning: The `fitz` API is deprecated and will be removed in future. Use `import pymupdf` instead.
{"ok": true, "status": "completed", "page_count": 33, "watermark_hits": [{"page": 1, "rule_id": "literal", "text": "本报告仅供"}, {"page": 1, "rule_id": "literal", "text": "已记录日志请勿传阅"}, {"page": 1, "rule_id": "literal_search", "text": "本报告仅供"}, {"page": 1, "rule_id": "literal_search", "text": "已记录日志请勿传阅"}], "redaction_count": 3, "output_sha256": "bdff1c68f8bc52f653e2a722f011a2899807a92a03e91df8382214358: SE 43216212

## 恢复建议

- 无
