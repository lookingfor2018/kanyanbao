# Kanyanbao 验收报告 | 2026-04-06

run_id: kanyanbao-2026-04-06-150755
mode: scheduled
timezone: Asia/Shanghai
delivery_status: blocked
自动推送结论: 阻断

## 8 个核心场景结果

1. 登录与下载：FAIL - 候选报告数=0
2. 7 日筛选与新增标记：PASS - upload_at 字段完整性检查
3. 板块归类与排序：PASS - section 字段完整性检查
4. 脱敏有效性：PASS - 仅 completed 才可自动放行
5. 翻译与总结：PASS - 每篇 6 条摘要检查
6. 对象存储/签名/短链：FAIL - link_status=shortened 检查
7. 链接异常处理：PASS - failed/expired 状态检查
8. 飞书文本与卡片：PASS - feishu_cards 结构检查

## 阻断原因

- delivery_status=blocked
- 存在未就绪短链接

## 人工复核项

- 无

## 恢复建议

- Live acquisition succeeded but no fresh PDF was downloaded: N/A 
