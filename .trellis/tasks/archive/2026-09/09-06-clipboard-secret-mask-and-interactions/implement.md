# Implement — 剪贴板历史：密钥掩码一致性与交互修复

五个里程碑，按"风险从高到低、依赖从底到顶"排序。每个里程碑结束跑一次验证并单独提交，不攒到最后。

## 验证命令

```bash
# 插件单测（默认跑这个）
pnpm --filter @talex-touch/clipboard-history-plugin test

# 插件类型检查
pnpm --filter @talex-touch/clipboard-history-plugin typecheck

# 只有 M5 动了共享包才需要
pnpm --filter @talex-touch/utils typecheck
```

> `.bin` shim 在仓库搬迁后可能失效；`pnpm --filter <pkg> <script>` 会触发全量 install，被中断会清空根 `.bin`。若遇到，直接进包目录用 `node_modules/.bin/vitest run`。

---

## M1 掩码单一来源（安全，最高优先级）

- [ ] `clipboard-shapes.ts`：`ClipboardSecretInfo` 增加 `maskedContent`；四个 `detectSecret` 返回分支各自填上（token/jwt = `masked`，connection-string = `masked`，env = `` `${service}=${masked}` ``，private-key = `'私钥内容不予显示'`）。
- [ ] `clipboard-shapes.ts`：新增 `getClipboardDisplayTitle(item)` 与 `getClipboardPreviewText(item, reveal)`。private-key 在函数内部吞掉 reveal。
- [ ] `ClipboardSidebar.vue`：`getClipboardTitle` → `getClipboardDisplayTitle`，正文与 `:title` 两处都换。
- [ ] `ClipboardDetail.vue`：`<pre>{{ item.content }}</pre>` → `getClipboardPreviewText(item, revealSecret)`；图片 `:alt` 也换成 display title。
- [ ] `ClipboardMoreInfo.vue`：`textInsight` computed 前置 `detectSecret` 判定，命中则返回 `null`。

**验证**：新增一条测试，用 `sk-` + 48 位假 key 挂到 `type: 'text'` 记录上，挂载 `ClipboardManagerView`，断言 `wrapper.html()` 不包含该 key 原文；断言 `更多信息` 的 summary 不含"字符拆分"。

**回滚点**：M1 独立成一次提交。后续里程碑失败不影响这次安全修复。

---

## M2 reveal 开关

- [ ] `ClipboardDetail.vue`：`revealSecret` ref + `watch(() => props.item?.id)` 复位；预览区右上角开关按钮（`eye` glyph），`v-if="secret && secret.kind !== 'private-key'"`。
- [ ] `ClipboardInsight.vue`：内部 `revealSecret` → `revealParams`（只服务链接敏感参数）；新增 prop `revealSecret?: boolean`；「值」那一行 reveal 时显示本地现算的完整值，**不**把明文塞进 `ClipboardSecretInfo`。
- [ ] `ClipboardDetail.vue` 把 `:reveal-secret="revealSecret"` 传下去。

**验证**：单测覆盖 AC2（开→明文、切记录→复位）与 AC3（私钥无开关、DOM 无正文）。

---

## M3 user-select + 分类条键盘切换

- [ ] `main.css`：`#app` 加 `user-select: none`（含 `-webkit-` 前缀）；`input, textarea` 放开。
- [ ] `ClipboardDetail.vue` scoped：`.code-preview { user-select: text }`。
- [ ] `ClipboardInsight.vue` scoped：`.ocr-text { user-select: text }`。
- [ ] `ClipboardManagerView.vue`：`moveFilter(delta)`（在 `ready` 项上取模循环）+ `handleKeydown` 的 Cmd/Ctrl+←/→ 分支，放在 ArrowDown/Up 分支之前。
- [ ] footer hints 补一条 `⌘/Ctrl ←→ 切换分类`。

**验证**：单测覆盖 AC6（触发 keydown 后 filter 变化并发起对应查询、输入框内不触发）。`user-select` 是纯 CSS，靠人工在真实窗口拖一次确认，不写测试。

---

## M4 图片主题色带竖排

- [ ] `ClipboardDetail.vue` 模板：`.palette-strip` → `.palette-rail` 移到 `.image-frame` 同级右侧；删 `.palette-caption`，说明改挂 `title`。
- [ ] scoped style：`.image-block` 改 flex row；`.image-container { min-height: 0 }`；`.preview-img { max-height: 100% }`；`.preview-surface[data-kind='image'] { overflow: hidden }`。

**验证**：人工在真实窗口看一张长图 + 一张宽图，确认无滚动条、色带竖排、色块可点复制。已有的调色板相关单测必须仍然绿（`extractPaletteFromImage` 那条路径不动）。

---

## M5 主动作分派（依赖 SDK，风险最高，放最后）

**第一步先实测通道** —— 已做，结论是**通道走不通，design.md D8 的假设是错的**。

- `TuffMainTransport.on()`（`packages/utils/transport/sdk/main-transport.ts:818`）自 #688 起对插件通道**默认拒绝**：只有 `isPluginFacingEvent(eventName)` 为真的事件才会 `regChannel(BRIDGE_CHANNEL.PLUGIN, ...)`。
- 白名单 `packages/utils/transport/security/plugin-facing-events.ts:66` 里 `AppEvents.system.*` 只有 `captureSelection` / `getActiveApp` / `resolveApplication` 三个；`openExternal` 和 `showInFolder` 都不在。
- design.md 引用的 `system-shell-handlers.ts:99` 那条注释（「transport.on registers on the plugin channel too」）**写于 #688 之前，现在是过时的**。以它为证据是我的错误。
- 白名单不是手工维护的：`packages/utils/__tests__/plugin-facing-events.test.ts` 从 `packages/utils/plugin/**` 的源码反推它，双向失败。所以「往 plugin SDK 加一个方法」和「往白名单加一条」是同一个动作的两半，必须一起做——这也意味着它是一次显式的边界放宽，不是顺手加的。
- Prelude 侧有 `open-url` capability（需 manifest 声明 `system.shell` 权限），但**没有任何 reveal/定位文件的 capability**；且 Surface 调不到自己的 Prelude（`PluginEvents.api.triggerFeature` 也不在白名单里）。

### 已完成

- [x] `clipboard-shapes.ts`：`ClipboardPrimaryAction` + `resolveClipboardPrimaryAction` + `getClipboardPrimaryActionLabel`
- [x] `ClipboardActionBar.vue`：`primaryActionLabel` prop；emit `copy` → `primary`；测试跟随更新
- [x] `ClipboardManagerView.vue`：`handlePrimaryAction()` 分派；Cmd/Ctrl+Enter 改调它
- [x] `ClipboardDetail.vue`：应用内大图浮层（`v-model:image-viewer-open`，Esc 关闭，浮层开时吃掉方向键）
- [x] `previewFile` 接线（接到 `handleRevealFile`）

### 阻塞中

已解除。用户裁定走「白名单 + 权限门」，链接与文件一起做。落地：

- `packages/utils/plugin/sdk/system.ts` 加 `openExternal` / `showInFolder`（三段式补齐）。
- `PLUGIN_FACING_EVENTS` 的 AppEvents 从 6 条增至 8 条。
- `system-shell-handlers.ts` 两个 handler 包 `withPermission({ permissionId: 'system.shell', failClosedForPlugin: true })`；**不**开 `requireVerifiedPlugin`——宿主 renderer 也调这两个事件且没有 plugin context，开了会把宿主自己拒掉。
- clipboard-history manifest 把 `system.shell` 声明为 **optional**，所以拒绝是正常结局，UI 区分「无权限」与「打不开」两种文案。
- 顺手改掉 `system-shell-handlers.ts` 里那条导致本次规划出错的过时注释。

反向对照都跑过：

- 把 SDK 里的 `transport.send(AppEvents.system.openExternal, ...)` 去掉 → 白名单派生测试报 `extra`，证明它双向咬合。
- 把 `withPermission` 换成恒等函数 → 新增的两条权限测试红，证明门是真的。（注意：只改属性名不改 `AppEvents.*` 引用**不会**让派生测试失败——它扫的是事件引用，第一次控制组我设计错了。）

### 三条可选路径（决策已定：A）

| 方案 | 动作 | 代价 |
|---|---|---|
| A 白名单加 `openExternal` | 一行加进 `PLUGIN_FACING_EVENTS` + plugin SDK 加方法 | **所有插件 Surface** 都能打开链接，且不需要声明任何权限——比 Prelude 的 `open-url`（要 `system.shell`）更松 |
| B Prelude 桥接 | 加 `system.shell` 权限 + `open-url` capability，再新开一条 Surface→Prelude 通道 | 权限模型正确，但要新建通道，工作量最大；且仍解决不了文件定位 |
| C 缩范围 | 链接/文件维持复制，另开任务 | 本任务 R5 只交付图片预览那一半 |

文件定位在 A/B 下都需要新增宿主能力（`showInFolder` 无权限门且是文件存在性探测器），单独评估。

---

## M4 图片主题色带竖排（已完成）

## 完成前的整体检查

- [ ] `pnpm --filter @talex-touch/clipboard-history-plugin test` 全绿
- [ ] `pnpm --filter @talex-touch/clipboard-history-plugin typecheck` 全绿
- [ ] `pnpm --filter @talex-touch/utils typecheck` 全绿（M5 动了共享包）
- [ ] 真实窗口人工过一遍：拖拽不全选、Cmd+←→ 切分类、图片预览无滚动条、密钥四处掩码、Cmd+Enter 四种类型各按一次
- [ ] `prd.md` 的 AC1–AC12 逐条对照勾选，没做到的写明原因而不是留空
