# 根目录杂物盘点（root-clutter）

> 只读分析，2026-07-30。所有路径均未做任何改动。
> 分级：A=可安全删除；B=加 .gitignore 后删本地；C=归档移动；D=必须保留。

## 总览结论

- 7 个可疑目录**全部已被 .gitignore 覆盖，且零已跟踪文件**——删除它们不影响 git 历史，全部可归 A 级。
- 根目录 6 个散置文件中，`paseo.json`、`.env.sentry-build-plugin` 已被 gitignore 且未跟踪；`tuffex.md` **已被误提交进库**（commit b8261e06b），是 C 级归档移动的首要对象。
- `.gitignore` 覆盖检查：output/（L137）、.doc.local/（L136）、.playwright-mcp/（L112）、test-results/（L114）、.golutra/（L128）、.spec*（L121）、.spec-workflow*（L122）**全部已覆盖，无遗漏项**。

## 目录逐项

### 1. `output/` — 1.0G，877 文件 — A 级
- git：`.gitignore:137 output/` 覆盖；无已跟踪文件。
- 内容：仅一个子目录 `output/playwright/`（独占 1.0G），内为 Playwright 截图（`nexus-aireview-*.png`）、控制台错误日志、locale payload 快照（2026-07-12 前后）。
- 性质：一次性视觉验证产物，可随时重跑生成。**可安全删除**（释放约 1.0G）。

### 2. `.doc.local/` — 76M，1358 文件 — A 级
- git：`.gitignore:136 .doc.local/` 覆盖；无已跟踪文件。
- 内容：`corebox-vs-utools-gap.md`（3.5K 竞品分析笔记）+ `docs-evidence/`（4 个证据目录：coreapp 截图、native 截图、启动冷/热跑数据，2026-06-18~21）。
- 性质：一次性调研证据缓存。注意 `corebox-vs-utools-gap.md` 是唯一有信息量的文件，如认为有价值可先抽到 `docs/` 再删（可选，不阻塞删除）。**可安全删除**。

### 3. `.playwright-mcp/` — 18M，378 文件 — A 级
- git：`.gitignore:112` 覆盖；无已跟踪文件。
- 内容：380 个 `console-*.log`（Playwright MCP 会话控制台日志，最近为 2026-05-15，已一个多月未写入）。
- 性质：AI 浏览器工具会话缓存。**可安全删除**。

### 4. `test-results/` — 4K，1 文件 — A 级
- git：`.gitignore:114` 覆盖；无已跟踪文件。
- 内容：仅 `.last-run.json`（Playwright 上次运行状态，内容为 failed/空列表）。
- 性质：测试运行器状态文件，自动重建。**可安全删除**。

### 5. `.golutra/` — 36K，7 文件 — A 级（备选 B）
- git：`.gitignore:128` 覆盖；无已跟踪文件。
- 内容：`agents/`、`skills/`、`local.json`（lastOpenedAt + machineId）、`roadmap.json`、`workspace.json`，时间戳 2026-03-08，近 5 个月未动。
- 性质：已弃用的 AI 工具（golutra）本地配置/缓存。工具似已弃用，**可安全删除**；保守做法 B：确认工具不再使用后删除。

### 6. `.spec/` — 32K，8 文件 — A 级（建议先确认内容已迁移）
- git：`.gitignore:121 .spec*` 覆盖；无已跟踪文件。
- 内容：旧"Project Knowledge Base"（architecture/conventions/features/modules/sop + index.md），自述为"单一真实来源"，但时间戳停在 2026-02，职能已被 `.trellis/spec/` 取代。
- 性质：旧 AI 知识库残留。建议删除前快速比对 `.trellis/spec/` 是否已覆盖其 3-4 篇主题（布局原子化、CoreBox 主题），有遗漏先搬运再删。**实质等同 A 级**。

### 7. `.spec-workflow/` — 436K，49 文件 — A 级
- git：`.gitignore:122` 覆盖；无已跟踪文件。
- 内容：spec-workflow 工具的 approvals/specs/templates（含 catalog-service-mvp、omnipanel-assistant-next 两个旧 spec），templates 占大头。
- 性质：已弃用的 spec 工具工作区（职能由 Trellis 取代）。两个旧 spec 主题与现有 Trellis 任务重叠，无独立价值。**可安全删除**。

## 根目录散置文件

| 文件 | git 状态 | 判定 | 说明 |
|---|---|---|---|
| `paseo.json` | gitignore:120 覆盖，未跟踪 | **D 保留** | paseo worktree 工具配置（`worktree.setup: ni`），位置正确（工具约定读根目录）。 |
| `wrangler.toml` | 已跟踪，未忽略 | **D 保留** | Cloudflare Pages/D1/R2/KV 部署配置（nexus 文档站），必须在根目录。 |
| `commitlint.config.cts` | 已跟踪 | **D 保留** | commitlint 约定配置，标准根目录位置，husky 钩子依赖。 |
| `.bumpprc.json` | 已跟踪 | **D 保留** | bump 版本工具配置（package.json + core-app 双包），根目录合理。 |
| `.env.sentry-build-plugin` | gitignore:106 覆盖，未跟踪 | **D 保留** | Sentry sourcemap 上传 token，构建期由插件读取，位置正确且已正确防提交。 |
| `tuffex.md` | **已跟踪**（b8261e06b 混入提交），11K | **C 归档移动** | 见下。 |

### `tuffex.md` 专项判断
- 内容性质：07-28 tuffex 组件文档审计的**交接/状态备忘**（MDC 围栏守卫未提交的缺口告警、待办清单），非组件库正式文档。开头自述"详细产物在 `.trellis/tasks/07-28-tuffex-docs-audit/`"。
- 不应留在根目录；也不宜进 `docs/`（时效性强，审计轮次结束后即过期）。
- **建议（C 级）**：`git mv tuffex.md .trellis/tasks/07-28-tuffex-docs-audit/handoff-2026-07-28.md`——内容本身就是该任务的交接产物，且任务仍 in_progress，放回任务目录可保持可追溯。次选：`docs/engineering/reports/tuffex-docs-audit-handoff.md`。

## 清理清单汇总（待用户确认后执行）

**A 级——可直接 `rm -rf`（均未被 git 跟踪，共约 1.1G）：**
1. `output/`（1.0G）
2. `.doc.local/`（76M）
3. `.playwright-mcp/`（18M）
4. `test-results/`（4K）
5. `.golutra/`（36K）
6. `.spec-workflow/`（436K）
7. `.spec/`（32K，删除前建议先比对 `.trellis/spec/` 覆盖度）

**C 级——git mv 归档（1 项）：**
8. `tuffex.md` → `.trellis/tasks/07-28-tuffex-docs-audit/handoff-2026-07-28.md`

**D 级——保留不动：** `paseo.json`、`wrangler.toml`、`commitlint.config.cts`、`.bumpprc.json`、`.env.sentry-build-plugin`。

**B 级：** 无（所有临时目录均已被 gitignore 覆盖，无需新增规则）。

**无需修改 `.gitignore`**：output/、.doc.local/、.playwright-mcp/、test-results/ 四项全部已覆盖。
