# Tuff v2.4.14-beta.21 更新说明

## 摘要

- Linux x64 musl 发布包现在显式包含 LibSQL 原生运行时依赖，避免打包阶段缺失数据库客户端二进制。
- 此版本用于重新建立三平台官方发布与 OTA 验收的候选资产链路。
- 发布门禁继续保持 fail-closed：缺失平台二进制会在打包阶段阻止生成不完整的官方资产。

## 变更内容

- 将 `@libsql/linux-x64-musl` 固定为 CoreApp 的可选运行时依赖；Linux packaged build 的 runtime closure 因此可以完整解析该平台二进制。
- 未修改更新健康状态机、签名校验或发布 fail-closed 门禁；后续仍须通过官方 Windows、macOS、Linux N→N+1 验收。
