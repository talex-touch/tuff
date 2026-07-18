# 技术设计：OTA UI、Rollback Manifest 与验收

## 1. Shared contract

Manifest clean cutover 到 schema v2：

```ts
interface UpdateReleaseManifest {
  schemaVersion: 2
  release: {
    version: string
    channel: AppPreviewChannel
    tag: string
    rollbackFromVersion: string
    rollbackCompatible: boolean
  }
  artifacts: UpdateReleaseArtifact[]
}
```

`rollbackFromVersion` 不含 `v`。shared validator 验证非空、非当前、同渠道且严格更旧；CLI validator 额外接受 `--expected-rollback-from-version`，发布流水线用同渠道上一 tag 的精确版本调用。`rollbackCompatible=false` 是合法 manual-only release，不是 schema 失败。

## 2. Compatibility propagation

1. `prepare-release-assets` 是 rollback metadata 唯一生成 owner。
2. GitHub manifest、Nexus release metadata 和 CoreApp normalized candidate 原样携带字段。
3. Download task metadata保存字段；`UpdateService` 在 available/downloading attempt 上提交 `rollbackCompatible`，并将 attempt 的 `installOnNormalQuit` 收窄为用户设置与 compatibility 的交集。
4. `UpdateInstallCoordinator` normal quit 检查 attempt 字段；platform recovery 仅在 compatible attempt 上选择 previous。
5. renderer 只读取 snapshot，不重新从版本名/平台推断 compatibility。

## 3. UI projection

新增纯函数 `resolveUpdateLifecycleDisplay(snapshot, platform)`，返回 tone、label/description key、install/check availability、normal-quit lock、previous/error metadata。`useUpdateRuntime` 提供 readonly authoritative snapshot ref；所有 check/download/install/status/available response 经过既有 revision guard 后更新。

`SettingUpdate`：

- 删除本地 downloadReady/version/task 三元状态；全部 computed 自 snapshot。
- 状态块展示 phase、target、revision、previous、stable error code。
- 只有 ready + taskId 可 install-now；进行中阶段不显示 check 按钮；failed/recovered/healthy 可检查。
- macOS=`Restart to Update`，Windows=`Start Installer`，Linux=`Open Package`。
- macOS 展示 native trust waived warning，并写入 diagnostic evidence。

## 4. Evidence contracts

`OtaAcceptanceEvidenceV1` 每文件绑定 release current/rollback、platform/arch、classification、artifact source、profile scope 与 checks。

- `host-runtime`: pair 必须等于 CLI host pair；runtime checks 和 profileCompatibility 全为 true。
- `static-only`: 仅 manifest/asset/signature checks 为 true，runtime checks 必须为 null。
- `rollbackCompatible=true`: 三个 pair evidence 齐全，并由真实 host 分别产出 runtime/profile pass 后才可生成；本机单次验证不得升级其他 pair。
- 临时 profile 只能 `isolated-controlled`；不得标记 `real-profile`。

发布 workflow 默认 `rollbackCompatible=false`。只有显式提供并通过 validator 的 evidence bundle 才传 true；这保证新 gate 落地时不会阻塞手动发布，也不会误启 normal-quit/auto recovery。

## 5. Nexus

Nexus release record/API 增加 rollbackFromVersion/rollbackCompatible。Create/Patch/sync 原样存储；latest 返回字段。Nexus 不解析 tag 选择 N-1，防止与 manifest owner 漂移。

## 6. Compatibility

schema v1 不再进入新下载路径；历史 v1 manifest fail closed 并重新下载新 release metadata。旧 lifecycle DB 行 migration 默认 `rollbackCompatible=false`，因此不会意外自动安装/恢复。
