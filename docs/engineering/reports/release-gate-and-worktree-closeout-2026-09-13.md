# 工作树收口与 quality:release 门禁闭环（2026-09-13）

> 日期：2026-09-13
> 基线：`master`，本轮起点 `55da5867d`，收口后 `da19acba8`
> 范围：① 收干净工作树 ② 打通并复跑 `quality:release`
> 性质：除根 `.gitignore` 一行锚定与两个 task evidence 文件外，**未改动任何产品代码**
> 相关任务：[`.trellis/tasks/archive/2026-09/09-12-unified-app-destinations/`](../../../.trellis/tasks/archive/2026-09/09-12-unified-app-destinations/task.json)、[`.trellis/tasks/08-23-release-cicd-ota-acceptance/`](../../../.trellis/tasks/08-23-release-cicd-ota-acceptance/prd.md)

## 0. 一句话结论

两项待办均已闭环：工作树在 `da19acba8` 上干净（含未跟踪）；`quality:release` 的五段在 clean committed HEAD 上逐步执行、每段 `exit 0`。本地发布 preflight 的证据由此从「未提交批次」刷新为「绑定具体提交」，但**不改变** release-cicd-ota 任务 AC7/AC8 的外部真机结论。

## 1. 处置对象 ①：收干净工作树

### 1.1 起始事实

会话开始时的未提交改动，是 `09-12-unified-app-destinations` 的在途实现，横跨 shared catalog、destination provider、navigation service、调用方收敛与配套测试；`tuff-dsl.ts` 另带两处 lint 债务（`perfectionist/sort-imports`、`ts/method-signature-style`）。

### 1.2 过程与判定

| 步骤 | 动作 | 结论 |
| --- | --- | --- |
| 备份 | 归档 tracked diff、untracked 清单与 untracked 打包 | 动手前建立可回滚基线 |
| 验证 | 聚焦 vitest 4 文件 `144 passed`；`typecheck:node` / `typecheck:web` exit 0 | 改动本身健康 |
| 广域复跑 | 广域 vitest 仅 `search-core.trace.test.ts` 1 例 hook 超时，隔离后通过 | 判为并行负载 flake，非源码缺陷 |
| lint 修复 | 对 app-destinations 相关文件跑 scoped `eslint --fix`，复检 exit 0 | 只作用于本任务文件，不污染其它基线 |
| 并发发现 | 另一 omp 会话（PID 52990）先行把 65 项改动落成一批 commit | 见 §1.3 |
| 收尾 | 处理唯一残余脏项（未跟踪根 `build/`） | 见 §1.4 |

### 1.3 与并发会话的交界

本仓当时存在并行 agent 会话。它在既有工作树上直接提交，产出 `11e0e5f0d feat(core-app): unify application destinations`（56 files, +4123/−723），其中包含 `09-12-unified-app-destinations` 的全部实现，也包含 `packages/utils/core-box/tuff/tuff-dsl.ts` 的 lint 修复（+15/−11）。因此 #1 的「实现落地」由该会话完成，本会话职责收敛为**验证其正确性、清理残余脏项、并在并发写入期间区分真实缺陷与半成品假象**：

- `CreditsSummaryBlock.test.ts` 的 prettier warning 曾使 lint 瞬时失败，属并发会话写到一半的中间态，作者随后自修；复跑该文件 exit 0。
- 归档任务 `task.json` 现为 `status=completed`，`prd.md` 全部验收项 `[x]`，交付文件（shared catalog、provider、navigation service 及其测试）均为 TRACKED。

### 1.4 残余脏项的根因与修复

收尾时工作树只剩一项：**未跟踪的根目录 `build/`**（node-gyp 生成的 `config.gypi`，约 20 KB）。根因是 `f1266e1d1 chore(build): remove generated node-gyp config snapshot` 删除了被跟踪的快照，却从未把该目录加入 ignore，于是每次原生安装都会重新弄脏工作树。

修复采用**锚定模式 `/build/`（仅仓库根）而非裸 `build/`**：`apps/core-app/build` 存放被跟踪的 electron-builder 资源（`icon.icns`、`entitlements.mac.plist` 等 6 个文件），裸模式会误伤。已用 `git check-ignore apps/core-app/build/icon.icns`（rc=1，未忽略）验证边界正确。该修复提交为 `55da5867d chore(repo): ignore root node-gyp build scratch`（走完整 pre-commit：`sync:core-pkg` → `check-bin-shims` → `lint-staged`）。

### 1.5 结果

`da19acba8` 上 `git status --porcelain --untracked-files=all` 为空；`git diff --check` 干净；`.dsh-plugin-hub-*` 一类本地临时产物由 `.gitignore` 覆盖、不进状态。

## 2. 处置对象 ②：打通 quality:release

### 2.1 门禁定义

```text
pnpm lint && pnpm typecheck:all && pnpm test:targeted
  && pnpm -C apps/core-app exec electron-builder --version
  && pnpm -F @talex-touch/core-app run build
```

### 2.2 此前记录的问题

release-cicd-ota-acceptance 任务里已有的 `quality:release` 通过记录，锚定的是**未提交的多任务批次**，未绑定任何提交；该任务自己的 R1 也写明「先建立当前未提交批次的可信质量基线」。批次提交后，这份证据不再指向具体代码状态。

### 2.3 本轮复跑（clean committed HEAD）

为可归因，五段**分别以前台单命令**执行，而非复合脚本：

| 阶段 | 命令 | exit | 耗时 |
| --- | --- | --- | --- |
| Repository lint | `pnpm lint` | 0 | 18s |
| Workspace typecheck | `pnpm typecheck:all` | 0 | 117s |
| Targeted tests | `pnpm test:targeted` | 0 | 6s |
| Packaging preflight | `pnpm -C apps/core-app exec electron-builder --version` | 0 | 1s |
| CoreApp production build | `pnpm -F @talex-touch/core-app run build` | 0 | 96s |

- targeted tests：CoreApp `3 files / 64 tests` + Nexus `2 tests`。
- electron-builder：解析到 `26.15.3`。
- CoreApp build：renderer 打包完成，`built in 25.00s`。

证据已回写至 [`.trellis/tasks/08-23-release-cicd-ota-acceptance/evidence/local-release-preflight.md`](../../../.trellis/tasks/08-23-release-cicd-ota-acceptance/evidence/local-release-preflight.md) 的 “Rerun 2026-09-13 On Clean Committed HEAD”，并在该任务 PRD 的 Confirmed Facts 追加一行指针。

### 2.4 结论

`quality:release` 在 HEAD `55da5867d`（该复跑时点）上全绿，工作树干净。这是**首次把本地发布 preflight 绑定到已提交、干净工作树**的记录。

## 3. 关键判据与陷阱（防止复现）

1. **`exec eslint` 在 workspace 根不加载 flat config。** 直接 `npx eslint <file>` 会套用错误配置、产出成片假 error（实测某 shared 文件 44 个误报），而 `pnpm -C <pkg> exec eslint` 走包级配置、结果干净。权威口径只有 `pnpm lint` 与包级 `pnpm -C <pkg> exec eslint`；任何「普查 JSON 显示 0 error」若未走这两条路径，都不可信。
2. **`typecheck:all` 的 ~100s 静默不是 hang。** `packages/tuffex` 的 gulp 构建（`packages/tuffex/packages/script/build/index.ts`）长时间无输出，须给足超时而非误判卡死。
3. **共享 `dist` 不可并发重建。** 该任务已记录过一次 `@talex-touch/tuffex/scroll/style.css` 瞬时不可解析，根因是 TuffEx 重建忽略的 `dist` 时先删除再生成。并行会话不得并发重建共享产物。
4. **`/build/` 必须锚定。** 裸 `build/` 会吞掉 `apps/core-app/build` 下被跟踪的 electron-builder 资源。
5. **长门禁不要放后台 job。** 后台 job 会随 tool call 结束被回收；完整门禁应在受控前台执行或由独立执行者顺序跑完。

## 4. 证据边界

- 本文证明的是：**当前 worktree 在具体提交上的本地 release preflight**。
- 不证明：生产 Gate E、GitHub required checks、修复后官方 macOS N/N+1 OTA、Windows/Linux 真机运行时验收。
- 不含完整日志、环境变量、签名 URL 查询、凭据或用户 profile 数据。

## 5. 仍开放（6 项清单剩余项现状指针）

| 项 | 现状 |
| --- | --- |
| ② 审计 backlog 高危闭环 R1/R2/R3 | 未处理。R1 契约测试已接入但发布路径未接入；R2 macOS 发行架构未决；R3 结构问题已消除、只剩实测。见 [search/cross-platform audit PRD](../../../.trellis/tasks/07-13-search-crossplatform-audit/prd.md)。 |
| ③ 收敛 Trellis 任务树 | 未处理。活跃 117（in_progress 71 / planning 47），归档 202（2026-07 125 / 2026-08 52 / 2026-09 25），归档全部 `completed`。 |
| ④ 修 Nexus 断链 | 未处理，但根因已定性。`docs/engineering/reports/peripheral-docs-broken-link-inventory.md` 的 663 条 broken 中 636 条是「`.mdc` 实体被按旧 `.md` 扩展名引用」，属批量机械替换；其余 27 条需逐条判断。抽查 `dev/api/intelligence|storage|plugin-context|account`：`.en.md`/`.zh.md` 目标确实不存在，而同名 `.mdc` 存在。 |
| ⑤ 归档 `docs/plan-prd/01-project/CHANGES.md` | 未处理，且**不建议轻动**。该文件仍是 `README.md`、`ROADMAP.md`、`docs/INDEX.md`、`docs/engineering/README.md`、`PRD-QUALITY-BASELINE.md` 等引用的「已完成事实」SoT，并被 `scripts/intelligence/verify-intelligence.mjs` 纳入 `git diff --check` 路径集；归档会同时改引用面与门禁输入。 |

## 6. 复现命令

```bash
# 工作树状态
git status --porcelain --untracked-files=all

# 分阶段门禁（逐一给足超时，勿并行）
pnpm lint
pnpm typecheck:all
pnpm test:targeted
pnpm -C apps/core-app exec electron-builder --version
pnpm -F @talex-touch/core-app run build

# 或整体
pnpm quality:release
```
