# 技术设计：统一 OTA Provider 与安全门禁

## 1. 边界

本子任务只负责：远程 release 获取、来源回退、外部 payload 归一化、manifest/资产选择、下载后 hash/signature 验证。生命周期状态机和安装协调在后续子任务实现。

## 2. Provider outcome

在 `packages/utils/types/update.ts` 定义共享 outcome 与 candidate。建议 outcome 使用 discriminated union：

- `candidate`：归一化后的唯一候选。
- `none`：来源成功响应但当前 channel 无更新；Nexus 结果 authoritative。
- `policy-block`：Nexus 明确撤回/禁用/策略拒绝；禁止回退。
- `transient-failure`：网络、timeout、429、5xx；可按协调器规则回退。

`ReleaseFetchService.fetch()` 改为协调器，不再依据 setting 在 Nexus/GitHub 二选一。官方 OTA 固定执行 Nexus → 条件 GitHub；自定义来源不进入本次官方 fallback。

## 3. Cache ownership

当前 cache store 以 channel 取 entry，无法隔离 provider。改为稳定复合 key，例如 `nexus:RELEASE`、`github:BETA`。entry 继续保存 ETag、Last-Modified、rate limit、cooldown、failure count 和 releases。

顺序：fresh cache → Nexus network → 合法 fallback 时 GitHub network → 两者失败后 stale verified cache。Nexus 有效 none/policy 直接结束。

## 4. Candidate normalizer

单一 normalizer 接收来源响应和 `UpdateReleaseManifest`，输出：source、channel、tag/version、release notes、publishedAt、manifest、当前 pair asset、rollback metadata。当前子任务可先保留父任务后续需要的 rollback 字段，但不实现 recovery。

Nexus adapter 将官方 API asset 映射为 GitHub-compatible candidate 输入；GitHub adapter 必须显式下载 `tuff-release-manifest.json`。normalizer 只接受 manifest 声明的 core asset，不回退文件名打分。

共享 guard 负责：

- schema version；
- release version/tag/channel 一致；
- artifact name 唯一；
- core platform/arch pair 唯一；
- 当前 pair 存在；
- SHA-256 和 signature sidecar 名存在；
- 实际 release assets 中主文件和 sidecar 均存在。

## 5. Runtime verification

`UpdateSystem.downloadUpdate` 接收 normalized candidate 或只接收其中的 asset，不再调用本地 `findAssetForPlatform` 进行第二次推断。

checksum 使用 `createReadStream` + `crypto.createHash('sha256')`。`SignatureVerifier` 保留 signature 下载/解码与 RSA-SHA256 验证，但 `fetchSignaturePublicKey` 只调用 embedded key loader；删除 URL 解析、网络 key cache 和相关 env。

验证顺序固定为 manifest/identity → hash → signature。任何失败返回稳定 error code，后续状态机可直接映射。

## 6. 清理策略

- 删除无调用的 `UpdateSystem.checkForUpdates` 与直接 GitHub 获取函数；若仍有调用，先迁移至 `ReleaseFetchService`。
- renderer `GithubUpdateProvider` 只保留展示需要的薄 adapter，或在无真实调用后删除；不得继续拥有安装资产选择。
- `signatureKeyUrl` 从 shared types、manifest projection、download metadata 和 verifier 参数一次性删除。
- `TUFF_UPDATE_REQUIRE_SIGNATURE` 不再读取。

## 7. 验证重点

Provider 测试必须证明 error classification 决定 fallback，而不是 catch-all。安全测试必须证明缺失字段和历史 unsigned 资产不可安装。大文件 checksum 测试应验证 streaming API 被消费，而不是读取源文本。
