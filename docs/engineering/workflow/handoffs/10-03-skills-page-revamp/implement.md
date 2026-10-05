# Implement — 能力页改版为技能页

前置：`10-03-mcp-settings-page` 已经完成，`SettingSkillsMcp.vue` 只剩技能和目录两组。执行前先读 `design.md`。每一步跑完验证再继续。

## 步骤

1. [ ] **共享事件与多来源快照（main）**
   - 新建 `U/transport/events/skill-local.ts`，main 和 renderer 都改为从它导入。
   - `LocalSkillLocation.entryPath`、`locationsFor` 收集全部来源、`storeDir`、`set-enabled-batch`。
   - 验证：`skill-local-sources.test.ts` 补以下用例，原有用例全绿：
     - 两个根软链接到同一份文件：仍是一条，`sources` 有 2 项；
     - 物理拷贝各成一条；
     - `storeDir` 取包含 realpath 的根，按路径边界判断；
     - 不在任何根下时为 null。

     另外新增一个批量开关的测试，一次写盘、一次返回快照。
2. [ ] **`useLocalSkills`**
   - 实现行模型，包括代理、存放位置标签、导入型、排序。
   - 验证：新增单测，以 `lark-approval` 两份文件的形状作 fixture，期望得到两行，标签分别是「Codex · cc-switch 库」和「Claude · Pi · … · ~/.agents 共享层」；再加导入型 skill 的用例。
3. [ ] **分组列表与本机技能详情**
   - `TuffListTemplate` 两组、搜索、带前缀的选中 key、`SkillLocalInfo.vue`、骨架、留白。
   - 验证：新增 `IntelligenceCapabilitiesPage.test.ts`，断言分组顺序和计数、两组都能被搜索过滤、默认选中的项、选中本机技能时渲染 `SkillLocalInfo`。
4. [ ] **手动保存**
   - 页面草稿、`Info` 去掉自动保存状态、`testBlockedReason`、`SettingsPage` / `TuffAsideTemplate` 新增 footer 插槽、`SkillSaveBar.vue`、离开拦截。
   - 验证：
     - 页面测试补以下断言：
       - 编辑后显示脏状态，改回原值后脏状态消失；
       - 保存时只写改动过的 capability，批量开关只调一次，部分失败时保留失败那部分；
       - 放弃会恢复原值；
       - 有改动时离开会弹确认，三个选项各自的路由结果正确；
       - 有草稿时测试按钮禁用。
     - `IntelligenceCapabilityInfo.test.ts`：删掉 autosave 那组用例（209-250）。提示词归属和 2026-09-15 事故的断言（252-386）必须保持绿。
5. [ ] **技能目录弹层**
   - `#aside-footer` 放入口，加 `SkillDirsDialog.vue`。
   - 验证：新增单测，断言自动探测的根是只读的、用户目录可以移除、添加目录后列表刷新。
6. [ ] **改名与智能页清理**
   - 按 design 第 5 节逐个改 i18n 的值，用锚点编辑；收进两处硬编码；删掉不再引用的两个 key。
   - 去掉智能页里的 `SettingSkillsMcp`，删除它的文件和测试，同步更新 `SettingIntelligencePage.test.ts`。
   - 验证：
     - `rg '能力' R/views/base/intelligence/IntelligenceCapabilitiesPage.vue R/components/intelligence/capabilities` 没有残留（注释除外）；
     - zh-CN 里与本页相关的 key 中不再有「能力」；
     - `categories.smoke.test.ts`、`VoiceRecognitionStatus.test.ts` 通过。
7. [ ] **整体校验**
   - 本任务涉及的全部 vitest 文件；
   - 在 `apps/core-app` 下直接调 vue-tsc / tsc 入口跑 typecheck（node 和 web 都要）；
   - 改动文件按 core-app 的 eslint 配置检查，lint delta 为 0；
   - `git diff --check`。
8. [ ] **真实应用验收**（dev 实例加 CDP，截图存到 `/tmp`）
   - 侧栏显示「技能」。
   - 左栏两组和计数正确；卡片到分栏线约 12px。
   - `lark-approval` 显示为两行，点开后详情里的来源代理和存放位置正确。
   - 依次操作并截图：
     1. 切换一个本机技能、改一个内置技能的渠道，底部条显示「有 2 项未保存的更改」；
     2. 在侧栏点别的页，弹出确认，选「取消」后留在页面；
     3. 点「保存」，底部条显示「已保存」；
     4. 重启 dev 实例后改动仍在；
     5. 再改一次后点「放弃更改」，恢复原值。
   - 智能页里不再有技能组。
   - 搜索「apple」，只剩匹配项。

## 回滚点

- 第 1 步（main）可以单独回滚。快照新增的是字段，旧的渲染层不读它们也不会出错。
- 第 2–5 步只动渲染层，可以整体回滚。
- 第 6 步改文案、清理智能页，必须在第 3 步之后，可以单独回滚。

## 开工前检查

- 确认 MCP 子任务已经提交，`SettingSkillsMcp.vue` 是拆分后的状态。
- `implement.jsonl` 和 `check.jsonl` 已登记 spec 与 `research/skills-page.md`。
