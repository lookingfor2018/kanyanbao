# Kanyanbao GitHub 配置与联调手册

本文档对应当前实现的真实链路：`build -> deploy -> notify`。

## 第一步：开通 Pages

1. 打开仓库 `Settings -> Pages`
2. `Source` 选择 `GitHub Actions`
3. 保存

## 第二步：配置 Secrets（敏感）

路径：`Settings -> Secrets and variables -> Actions -> New repository secret`

按下表逐个新增：

| Secret 名称 | 用途 | 是否必填 |
|---|---|---|
| `SUMMARY_API_KEY` | 总结模型密钥 | 必填 |
| `FEISHU_APP_ID` | 飞书应用 ID | 推荐（APP 发信模式） |
| `FEISHU_APP_SECRET` | 飞书应用密钥 | 推荐（APP 发信模式） |
| `FEISHU_CHAT_ID` | 飞书群 chat id | 推荐（APP 发信模式） |
| `FEISHU_WEBHOOK_URL` | 飞书 Webhook | 可选（与 APP 模式二选一） |
| `FEISHU_VERIFICATION_TOKEN` | 飞书事件校验 | 可选 |
| `FEISHU_ENCRYPT_KEY` | 飞书事件加密 | 可选 |
| `STORAGE_ACCESS_KEY` | 对象存储 AK | 必填（真实签名链接） |
| `STORAGE_SECRET_KEY` | 对象存储 SK | 必填（真实签名链接） |
| `SHORTLINK_SIGNING_KEY` | 短链签名盐 | 必填（static/api 均建议） |
| `SHORTLINK_API_TOKEN` | 短链 API token | 可选（仅 `SHORTLINK_PROVIDER=api`） |

## 第三步：配置 Variables（非敏感）

路径：`Settings -> Secrets and variables -> Actions -> Variables -> New repository variable`

| Variable 名称 | 示例 | 说明 |
|---|---|---|
| `SUMMARY_API_BASE_URL` | `https://gmn.chuangzuoli.com` | OpenAI 兼容地址 |
| `SUMMARY_MODEL` | `gpt-5.3` | 模型名 |
| `SITE_BASE_URL` | `https://<user>.github.io/<repo>/` | Pages 站点根地址 |
| `STORAGE_ENDPOINT` | `https://s3.example.com` | S3 兼容端点 |
| `STORAGE_REGION` | `auto` | 区域 |
| `STORAGE_BUCKET` | `kanyanbao-prod` | 桶名 |
| `STORAGE_PREFIX` | `reports` | 对象前缀 |
| `SIGNED_URL_TTL_SECONDS` | `604800` | 签名链接有效期 |
| `SHORTLINK_PROVIDER` | `static_redirect` | `static_redirect` 或 `api` |
| `SHORTLINK_BASE_URL` | `https://<user>.github.io/<repo>/` | 短链基地址 |
| `SHORTLINK_API_ENDPOINT` | `https://short.example.com/api/links` | 仅 `api` 模式需要 |

## 第四步：首次联调运行

1. 进入 `Actions -> kanyanbao-digest -> Run workflow`
2. 参数建议：
   - `mode=manual`
   - `skip_push=true`（先不发飞书）
3. 观察三个 job：
   - `build` 成功：说明编排和产物生成正常
   - `deploy` 成功：说明 Pages 发布正常
   - `notify` 在 `skip_push=true` 时会跳过推送

## 第五步：打开推送并端到端验证

1. 再次 `Run workflow`，这次设置 `skip_push=false`
2. 验证点：
   - `runtime/published/<run_date>/delivery_payload.json` 中 `delivery_status` 为 `ready/sent`
   - 飞书群收到消息
   - 站点里的短链可点开 PDF

## 常见问题

- `delivery_status=blocked`  
  先看 `runtime/published/<run_date>/acceptance_report.md` 的“阻断原因”。

- 签名 URL 校验失败  
  检查 `STORAGE_ENDPOINT / STORAGE_BUCKET / AK/SK` 是否匹配，桶策略是否允许 `GetObject`。

- 短链失败  
  `static_redirect` 模式下先确认 `SHORTLINK_BASE_URL` 与 Pages 地址一致；  
  `api` 模式下检查 `SHORTLINK_API_ENDPOINT` 与 `SHORTLINK_API_TOKEN`。

