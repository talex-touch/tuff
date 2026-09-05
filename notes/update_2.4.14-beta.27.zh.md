# Tuff v2.4.14-beta.27 更新说明

## 摘要

- 本版本作为 Beta26 修复版后的官方后续版本，用于真实验收 macOS OTA N→N+1。
- Beta26 更新器优先使用 Nexus signed URL；HTTP 403 表示签名 URL 过期时，仅切换一次到同一资产的 GitHub fallback，并继续当前 Range 分块。
- 继续执行 checksum、detached signature 与 startup health-ack 门禁。

## 变更内容

- 提供 signed URL 恢复修复后的官方 Beta26 → Beta27 OTA 验收版本对。
- 保留受控分块调度、终端失败传播与取消处理。
- 未放宽更新完整性或发布质量要求。
