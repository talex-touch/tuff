# Tuff v2.4.14-beta.26 更新说明

## 摘要

- 本版本作为 Beta25 后续官方更新包，用于复验 Nexus signed URL 过期后的 OTA 下载恢复、替换和启动健康确认。
- 官方更新资产优先使用 Nexus signed URL；HTTP 403 表示签名 URL 过期时，客户端可切换到已验证的 GitHub fallback 并继续已有分块。
- fallback 仅用于 signed URL 过期；其他权限错误继续 fail-closed。

## 变更内容

- 延续 Beta25 的受控 worker-pool 调度与终端失败收敛实现。
- 从过期 signed URL 切换 fallback 时保留已完成的 Range 分块和断点进度。
- 提供下一组官方 Beta25 → Beta26 OTA N→N+1 验收包。
- 未放宽 checksum、detached signature、发布门禁或 startup health-ack 要求。
