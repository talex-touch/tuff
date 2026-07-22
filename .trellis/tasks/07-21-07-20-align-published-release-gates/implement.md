# 对齐已发布版本 Release Gate 契约 — Implementation

## Execution order

1. 让 `gate-e` 跳过本地 notes 输入检查，保留远端双语 notes 门禁。
2. 将 GitHub assets 映射传入 Nexus/Manifest matrix 比较，允许 canonical endpoint 或精确 GitHub sidecar URL。
3. 用共享 CoreApp package classifier 区分 preferred package、同 pair 额外格式与非法 inventory。
4. 让签名探针请求每个 Nexus asset 实际配置的 `signatureUrl`，仅记录稳定、无敏感查询的结果。
5. 用 `v2.4.13-beta.19` 的真实 Manifest 运行 `gate-e --strict`；不得修改远端 release。

## Validation gate

- 真实 gate 输出 `result: pass`、退出码 0。
- 检查项必须包含 remote notes、Manifest/Nexus matrix、GitHub inventory、signature URL payload、download endpoint、latest。
- 验收目录和下载的 Manifest 在完成后删除。

## Rollback point

若真实 gate 仍失败，停止在本地代码变更；不写 Nexus、不修改 GitHub Release、不发布新 tag。