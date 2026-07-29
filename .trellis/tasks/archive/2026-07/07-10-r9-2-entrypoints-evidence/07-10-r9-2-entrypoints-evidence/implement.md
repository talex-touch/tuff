# Entrypoints And Evidence Execution

## Order

1. 固化 CoreBox context-aware integration baseline 与 evidence schema。
2. 接入 Workflow 独立 run session，补跨 run 隔离 tests。
3. 接入 OmniPanel 轻上下文，补 selection/capsule 与无历史 tests。
4. 接入 Assistant 轻上下文，补与 CoreBox/OmniPanel 隔离 tests。
5. 采集 controlled 与 packaged evidence，运行敏感内容扫描和 manifest verifier。
6. 更新全部 R9.2 项目文档，按 evidence 层级标记 done/partial/open。

## Validation

```bash
corepack pnpm -C "apps/core-app" exec vitest run "src/main/modules/ai/intelligence-context-hygiene.test.ts"
corepack pnpm -C "apps/core-app" run typecheck:web
corepack pnpm -C "apps/core-app" run typecheck:node
git diff --check
```

入口具体 focused test 与 evidence verifier 命令在实施时按现有 owner 文件补入，不在规划阶段虚构路径。

## Review Gates

- 非 CoreBox 入口不得复制 ContextHygiene 或 prompt assembler。
- packaged/real-profile evidence 未采集时保持 partial/open。
- evidence 中不得包含完整 prompt、response、turn、memory 或 retrieval chunk。

## Completion Evidence

- CoreBox/OmniPanel/Workflow/Assistant 共用 host-owned context execution；Workflow `Use Model` 每 run 独立 session，OmniPanel 与 Assistant 使用 `new + light`，Assistant query 通过 trusted one-shot context 绑定到实际 feature execute，且同值 reactive search 不再重复派发。
- Entrypoint-focused CoreApp suites：7 files / 108 tests passed；parent closure focused suites：9 files / 128 tests passed；官方插件 boundary：1 file / 42 tests passed；utils SDK boundary：2 files / 46 tests passed；typed event builder：1 file / 2 tests passed。
- Official plugin delivery sync suites：2 files / 8 tests passed；canonical `touch-intelligence` build 已同步到 CoreApp bundled runtime seed，同版本 signature drift 启动刷新已在 isolated profile 验证。
- `typecheck:node` 与 `typecheck:web` passed；本任务 12 个 CoreApp TS/TSX 文件 focused ESLint 0 errors / 0 warnings；任务 slice `git diff --check` passed。全局 `git diff --check` 仍被 Nexus 既有非本任务 whitespace 变更阻断，未改写用户工作。
- macOS arm64 packaged Electron + isolated profile + controlled Local/Ollama-compatible Provider：CoreBox owner=`corebox`、scope=`retrieval`、boundary=`new / retrieval`；Assistant owner=`assistant`、scope=`light`、boundary=`new / light`；Workflow owner=`workflow`、scope=`session`、boundary=`new / session`；OmniPanel owner=`omni-panel`、scope=`light`、boundary=`new / light`。CoreBox/Assistant/OmniPanel 各捕获 1 次 `/api/chat`，Workflow 两个独立 run 各捕获 1 次调用，均有 visible terminal result。
- `.trellis/tasks/07-10-r9-2-entrypoints-evidence/evidence/manifest.json` verifier passed：7 cases，6 passed；unit/controlled/packaged 均有 passed case，packaged entrypoints=`corebox, assistant, workflow, omni-panel`，privacy scan passed，real-profile 保持 open。
- Evidence artifact 只保存 owner/scope/mode/count/role/reason 等 metadata；不保存完整 prompt、result text、turn、memory、retrieval chunk、secret 或用户路径。
