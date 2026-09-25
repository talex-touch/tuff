# Implement — Nexus「模板 Templates」tab

执行顺序：A（基础设施，主会话串行）→ B（10 个模板，4 个 trellis-implement agent 按组并行）→ C（浏览器验收，主会话单一 ego TaskSpace）→ D（门禁与收尾）。

## 阶段 A — 基础设施（主会话）

- [x] A0 动共享文件前 `git diff -- apps/nexus/app/components/DocsSidebar.vue apps/nexus/i18n/locales/` 看并行会话是否已落地改动，基于最新内容修改。
- [x] A1 `app/utils/docs-suites.ts`：`templates` 键、四个 `Template*` 分类、三张映射表、头注释（design §2.1）。
- [x] A2 `app/components/DocsSidebar.vue`：`SuiteDef.entryPage`、`SUITES` 条目、`suiteOverviewLink` 回退、`SECTION_ORDER` 10 条（design §2.2）；如 `SUITE_ICONS` 已存在则补 `templates`。
- [x] A3 `i18n/locales/{zh,en}.ts`：`docsSidebar.suites.templates` + 四个 `categories.template*`（如 `suiteDescriptions` 已存在则补 `templates`）。
- [x] A4 `scripts/recategorize-component-docs.py`：`TAXONOMY` 四组 + docstring。脚本对「TAXONOMY 有条目但磁盘无文档」同样报错，必须与 A6 的内容页同批落地。
- [x] A5 `app/components/content/demos/TemplateFrame.vue`（design §4 全部契约）。
- [x] A6 10 个骨架 demo（`Template<Name>Demo.vue`：`TemplateFrame` + 占位内容）+ `demo-registry.ts` 10 行（字母序）+ 20 个骨架内容页（frontmatter + design §3.2 章节骨架 + `TuffDemoWrapper`）。
  - registry 行必须和 demo 文件同批落地：Vite 在转换 `demo-registry.ts` 时解析所有动态 import，缺文件会让**全部** demo 报错（共享 dev server 上其他会话也会受影响）。
- [x] A7 检查点：
  - `node build/check-demo-registry-orphans.mjs && node build/check-mdc-fences.mjs && node build/check-doc-translation-parity.mjs && node build/check-icon-collections.mjs`
  - `python3 scripts/recategorize-component-docs.py`（默认 dry-run；判据：输出 `would update 0 file(s)` 且退出码 0）
  - ego：侧栏出现「模板」tab 且位于「理念」后；点 tab 落到 `template-shell`；四个分组各列出对应页面；misc 兜底组为空；骨架页 `TemplateFrame` 展开 / 收起 / Esc / 滚动锁；浮层面板避开页头带（页头仍在最上层）；展开态内打开 tuffex popover / 下拉 / drawer 均叠在浮层之上。

A7 结果（2026-09-24）：门禁 / taxonomy / eslint / vue-tsc 全绿；ego 验证 zh+en tab 位置与跳转、四个分组、`TemplateFrame` 展开 / 收起 / 两段式 Esc / 滚动锁 / 焦点归还 / popover 与 tooltip 叠在浮层之上。过程中修了三处：en frontmatter 的 `: ` 让 YAML 解析失败、分类变 null（改写描述）；Esc 防护要用 `closest`（`aria-expanded` 在 `.tx-popover__reference` 包装层上）；遮罩改为主题底色 86% + blur（黑色 50% 在暗色页上压不住底下的文字）。

回滚点 R-A：A1–A6 全是插入式改动 + 新文件；撤销时先删内容页再撤 taxonomy（design §8）。

## 阶段 B — 模板实现（4 个 agent 并行）

| agent | 模板 | 调研上下文 |
|---|---|---|
| impl-app | Shell / Launcher / Settings | research/app-shells.md |
| impl-content | CMS / Gallery / Inbox | research/content.md |
| impl-ai | AgentChat / Research | research/ai.md |
| impl-data | Dashboard / Automation | research/data-flow.md |

每个 agent：
- 只改自己名下的 `Template<Name>Demo.vue` 与 `template-<slug>.{zh,en}.mdc`；不碰 registry、taxonomy、i18n、`TemplateFrame.vue`（发现 `TemplateFrame` 缺能力时回报主会话，不自行修改）。
- 按 design §5 约定 + §6 该模板的组合设计实现；中英文案同步；zh/en 章节数一致。
- 自检（不启动 / 不重启 dev server，不跑 `nuxt typecheck` / `pnpm typecheck`）：
  - `cd apps/nexus && node ../../node_modules/.pnpm/eslint@*/node_modules/eslint/bin/eslint.js <自己的文件>`
  - `node ../../node_modules/.pnpm/vue-tsc@*/node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p .nuxt/tsconfig.app.json 2>&1 | /usr/bin/grep -a "Template<Name>Demo"`（只看自己文件的报错）
  - `curl -s -o /dev/null -w '%{http_code}' 'http://[::1]:3000/_nuxt/components/content/demos/Template<Name>Demo.vue'` 为 200（dev server 编译通过；URL 里没有 `app/`，srcDir 就是 `app`）。2026-09-24 起 :3200 的旧进程卡在 500（`build/` 被并行会话改动时重载失败），可用的是 07:09 起的 `[::1]:3000`；不要重启任何 dev server。
  - `node build/check-mdc-fences.mjs && node build/check-doc-translation-parity.mjs && node build/check-icon-collections.mjs`
  - 图标名校验（`check:icon-collections` 只查集合不查名字）：
    ```bash
    cd apps/nexus && node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(require.resolve('@iconify-json/carbon/icons.json'),'utf8'));let bad=0;for(const f of process.argv.slice(1)){for(const m of fs.readFileSync(f,'utf8').matchAll(/i-carbon-([a-z0-9-]+)/g)){if(!d.icons[m[1]]&&!(d.aliases||{})[m[1]]){bad++;console.log(f+': '+m[0])}}}process.exit(bad?1:0)" <自己的 Template*Demo.vue>
    ```
- 不 commit，不用浏览器（ego 由主会话统一使用）。

## 阶段 C — 浏览器验收（主会话，一个 ego TaskSpace）

结果（2026-09-24）：10 个模板 × 列内暗 / 亮、展开、窄屏（560 视口 → 容器 470）全部截图核对，三档宽度均无横向溢出、无控制台报错（仅有 ego 里 Lexi 扩展造成的水合噪声，全站页面都有）。现场修了 5 处：Shell 横轴刻度（24→25 个采样点）、Settings 窄屏密度滑块塌缩、Launcher 常开 combobox 的 Esc 收起（`data-template-esc="self"`）、CMS 抽屉表单字段宽度与语言分段控件；agent 回炉 3 处：AgentChat 任务标题 / 写入前预览提示、Research 引用后标点折行、Automation 侧栏步骤标题 / 日志换行。减弱动效实测：AgentChat 停在闸门、Inbox 三封一次插入、Automation 直接完成。ego 中途自升级到 0.5.1.13 清空了 TaskSpace 8，改用 3 号空间继续。

每个模板逐项截图确认：
- [x] 列内（≈784px）暗色 / 亮色
- [x] 展开态（≈1280px）暗色：多栏布局生效，面板避开页头带，模板内弹出的浮层在最上层，Esc 收起后状态保留
- [x] 窄视口（容器 < 640px）单栏收起不溢出
- [x] 该模板的核心交互走一遍（design §6 列出的交互清单）；自动演示可被「重播」重新触发
- [x] 控制台无新增报错 / Vue warning

发现问题：小问题主会话直接修；成片问题 SendMessage 回对应 agent。

注意：并行会话 `09-23-nexus-base-gallery-sidebar` 正在重做 `TxStatCard`（API 不变）、`TxEmptyState` error 插画、`TxLayoutSkeleton`，并会重建 `packages/tuffex/dist`（锁 `/tmp/tuffex-build.lock`）。Shell / Dashboard 的截图以它重建后的 dist 为准；重建后 dev server 可能需要重启（由持有锁的一方负责），截图前先确认页面不是「tuffex dist is missing」。

另外两处外部依赖：CMS inspector 与 Inbox 阅读区的**暗色**截图要等 talex-touch-87 修完 `TuffexDocsHeroBackground.vue` 的 `.dark` 泄漏（否则 `TxMarkdownView` 根节点会被刷上白色径向渐变）；Gallery 详情先用 `TxModal` 验收，`TxFlipOverlay` 升级是后续项。

## 阶段 D — 门禁与收尾

- [x] `cd apps/nexus && node build/check-demo-registry-orphans.mjs && node build/check-mdc-fences.mjs && node build/check-doc-translation-parity.mjs && node build/check-icon-collections.mjs`
- [x] `python3 apps/nexus/scripts/recategorize-component-docs.py`（dry-run，须输出 `would update 0 file(s)`）
- [x] 图标名校验（同阶段 B 命令），对象为全部 `Template*Demo.vue` 与 `TemplateFrame.vue`
- [x] `cd apps/nexus && node ../../node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run test/docs/tuffex-component-docs-coverage.test.ts test/guards/component-auto-import.test.ts app/components/content/demo-client-boundary.test.ts`
- [x] eslint：本任务全部改动文件（在 apps/nexus 内跑，不从根跑）
- [x] vue-tsc（`.nuxt/tsconfig.app.json`，只读，不重生 `.nuxt/`）：本任务文件无报错
- [x] `git diff --check`
- [x] 3.3 更新规范：`component-guidelines.md`「TuffEx Suite Taxonomy」补 templates suite 与三条例外（design §2.5）；如 `TemplateFrame` 形成可复用约定，补进 `tuffex-docs-sync.md` 的 Demos 节。
- [ ] 不 commit，除非老板要求；提交时只 `git add` 本任务文件，提交后 `git grep MUTATION HEAD` 自查。
