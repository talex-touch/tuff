# CompressionSnapshot Execution

## Order

1. 核对 session 当前 summary/version 字段与既有 migration，确定无需 schema 变更的 CAS 方案。
2. 增加 snapshot validator、typed host contract 和 SQLite mapper。
3. 实现 transaction：snapshot + compression checkpoint + session summary CAS。
4. 接入 prepareTurn 最新 snapshot consumption 与 tombstone/privacy final filter。
5. 补 malformed、invalid range、oversized、CAS conflict、parse failure 和 no-turn-delete tests。
6. 更新 Audit metadata summary 与项目验收文档。

## Validation

```bash
corepack pnpm -C "apps/core-app" exec vitest run "src/main/modules/ai/intelligence-context-hygiene.test.ts"
corepack pnpm -C "packages/utils" exec vitest run "__tests__/transport-domain-sdks.test.ts"
corepack pnpm -C "apps/core-app" run typecheck:node
git diff --check
```

## Review Gates

- 不为当前 P1 引入模型专用 parser 框架或新数据库。
- 任何 schema/data migration 发现都必须暂停并单独请求危险操作确认。
- compression failure 绝不能删除或覆盖原 turns。

## Completion Evidence

- 复用既有 `intelligence_compression_snapshots`、session metadata/summary 与 checkpoint 表；未新增 schema 或执行 data migration。
- 新增 `CompressionSnapshotDraft`、metadata、create/list/latest result contracts，并同步 utils SDK、tuff-intelligence mirror 与 host-only plugin hard-cut。
- create transaction 在 `BEGIN IMMEDIATE` 内验证 session、source turn 存在性/顺序/隐私，写 snapshot + `compression_snapshot` checkpoint，再以 `expectedSessionUpdatedAt` CAS 更新 session summary/metadata；任一步失败均 rollback，且代码路径不执行 turn DELETE。
- validator 限制字段类型、单字段/数组项/总长度、metadata whitelist、secret/sensitive、user-rejected 与低置信内容；未知字段不进入 SoT。
- ContextPackage 使用最新 snapshot 的结构化摘要与 metadata-only provenance；最终读取再次校验 source range 隐私、checkpoint、secret、fact state、confidence 与 tombstoned memory，失败时排除或退化到 recent turns。
- CoreApp focused suites：2 files / 57 tests passed（service 48、host boundary 9）。
- Utils SDK suites：2 files / 45 tests passed；tuff-intelligence event suite：1 file / 2 tests passed。
- `typecheck:node` 与 tuff-intelligence `tsc --noEmit` passed；focused ESLint completed。
