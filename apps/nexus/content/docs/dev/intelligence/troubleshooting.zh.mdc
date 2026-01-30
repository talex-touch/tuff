# 排障

## 401 Unauthorized

- 确认 provider 的 `apiKey` 已配置。
- SDK 会在策略选择前过滤掉缺 key 的 provider，避免 churn。

## 400 Bad Request

常见原因：

- provider/model 不匹配（现在会在发请求前直接拒绝）
- payload 不合法
- embedding 输入过大（现在全局会 chunk/truncate）

## SQLITE_BUSY / SQLITE_BUSY_SNAPSHOT

典型症状：

- OCR 写入：`ocr_results` insert / `ocr_jobs` update 失败

缓解策略：

- 使用统一 DB 写入调度器（`db-write-scheduler.ts`）串行化写入。
- 减少大字段持久化（OCR 的 raw/snippet 已限制大小）。

## 调试清单

- 查看审计日志：`intelligence-audit-logger.ts`
- 校验 `intelligence.json`（providers + capabilities）
- 查看日志确认选择的 provider：`[Intelligence] Selected provider ...`
