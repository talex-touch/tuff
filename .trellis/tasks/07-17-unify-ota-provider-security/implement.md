# 实施计划：统一 OTA Provider 与安全门禁

## 1. Shared contract

1. 在 `packages/utils/types/update.ts` 增加 provider outcome、normalized candidate、稳定 error code 与 runtime guards。
2. 更新 transport/SDK 依赖的类型投影；不新增 raw IPC channel。
3. 对任何导出类型/字段改名或删除，先用 LSP references 获取完整调用面。

## 2. Provider coordinator

1. 重构 `ReleaseFetchService`，让 Nexus/GitHub adapter 返回统一 outcome。
2. 按 source/channel 重构 cache key 与读写。
3. 实现严格 fallback：Nexus none/policy 终止；network/timeout/429/5xx 才进入 GitHub。
4. GitHub 也失败后只允许 stale verified cache。
5. 将 Nexus/GitHub 响应归一化到 shared candidate。

## 3. Manifest 与资产选择

1. 抽出/复用唯一 manifest guard 与 candidate normalizer。
2. 迁移 `UpdateSystem` 和 renderer 的资产消费者。
3. 删除 manifest 已存在时仍按文件名打分的安装路径；metadata/signature/checksum/manifest 文件永远不成为候选。
4. 清理重复 discovery 调用和死代码。

## 4. Verification hardening

1. checksum 改为 stream。
2. `SignatureVerifier` 只使用 embedded public key。
3. 删除 `signatureKeyUrl`、网络公钥 URL/env/cache。
4. 删除 `TUFF_UPDATE_REQUIRE_SIGNATURE`；缺签名始终错误。
5. 确保 download completion 与 install 入口都消费同一验证结果，不重复实现条件。

## 5. Focused verification

- packages/utils：manifest guard、candidate normalizer、provider outcome。
- CoreApp main：fallback matrix、cache isolation、stream hash、signature fail-closed、重复路径迁移。
- 运行：

```bash
corepack pnpm -C "packages/utils" exec vitest run <update-contract-tests>
corepack pnpm -C "apps/core-app" exec vitest run \
  "src/main/modules/update/update-system.test.ts" \
  "src/main/modules/update/services/release-fetch-service.test.ts" \
  "src/main/utils/release-signature.test.ts"
corepack pnpm -C "apps/core-app" run typecheck:node
```

## 6. Review gate

- 搜索确认没有 `TUFF_UPDATE_REQUIRE_SIGNATURE`、`signatureKeyUrl`、网络 signing-key fallback。
- 每个 provider private payload 只有 adapter 读取；下载/安装层只接触 normalized candidate。
- catch-all error 不得触发 GitHub；只有显式 transient classification 可以。
- 当前三组 platform/arch 的 manifest fixture 全部可解析，重复或缺失 pair fixture 全部失败。
