# Implement — CoreBox ⌘K 操作面板重构

## Checklist

1. [x] 冲突表：列出 CoreBox 现有键盘绑定和 R6.1 新快捷键的冲突，写进 `research/shortcut-conflicts.md`。有冲突就先停下来报告老板。
2. [x] 事件类型：给 `MetaShowRequest` 追加可选的 `anchor` 和 `desiredPanelHeight`（packages/utils）。
3. [x] 主进程：`ipc.ts` 改成按需增高、记下原高度；`meta-overlay.ts` 在 hide 时还原；面板打开期间冻结 layout。
4. [x] 动作模型：统一描述、分组、去重、i18n 映射、图标，放在 `useKeyboard.ts` / `useActionPanel.ts`。lang JSON 只加 `corebox.actions.*` 下的 key。**`zh-CN.json` / `en-US.json` 正被其他会话改动，重新读取后只插入自己的 key，提交时只暂存自己的行。**
5. [x] `MetaOverlay.vue` / `MetaActionItem.vue`：
   - 按 design 重写：右下锚定面板、10% 遮罩、单行、分组标题、底部过滤框、空状态；
   - 键盘交互：IME 保护、瞬时滚动、pointermove hover。
6. [x] 快捷键：用 shortcut-chord 匹配，面板内和结果列表里都要生效。
7. [x] 执行反馈：在 CoreBoxFooter 显示即时反馈。
8. [x] 测试：更新现有的 meta-overlay / useActionPanel / useKeyboard 测试（28 个用例），反映新的行为；老板 2026-09-26 批准补单测，覆盖去重、快捷键冲突 / 生效范围、高度按需增高与还原、IME 保护。

## 后续（老板 2026-09-26 决定）与检查结果

- [x] Windows / Linux 固定快捷键改为 Ctrl+Shift+.（macOS 仍是 ⌘.）。
- [x] 面板撑高窗口时，CoreBox 用 `--tx-fill-color` 铺满头部以下，不再透出桌面：
  - 新增通知 `CoreBoxEvents.metaOverlay.panelState`；
  - 打开时先通知再增高；
  - 关闭时底色保留到窗口缩回落定（最多 1s）；
  - 画布布局下整个启动器都铺底色。
- [x] 「在 Finder 中显示」只选中、不打开：
  - `ShowInFolderRequest.reveal`；
  - macOS 包目录一律 `showItemInFolder`，堵住借这个接口启动 `.app` 的口子。
- [x] 执行失败时 footer 显示 `corebox.actions.failed`，日志只记动作 id 和错误码。
- [x] 按住 ↵ 不再误触发：面板吞掉自动重复的 Enter；CoreBox 只认本窗口看到按下的那次 Enter。
- 检查（trellis-check）：以上都已通过，补了测试和 12 个变异。
- 待老板决定：插件 UI 模式下 footer 不渲染，执行反馈既看不到，读屏也听不到。
- 接受的残留：没有已知扩展名、只靠 Finder bundle 位识别的包目录，仍然会被打开。

## Validation

```bash
cd apps/core-app
node_modules/.bin/vitest run src/main/modules/box-tool/core-box src/renderer/src/modules/box/adapter/hooks src/renderer/src/components/meta src/renderer/src/views/box
node_modules/.bin/vue-tsc --noEmit -p tsconfig.web.json --composite false; echo $?
node_modules/.bin/vue-tsc --noEmit -p tsconfig.node.json --composite false; echo $?   # 主进程改动
node_modules/.bin/eslint <changed files>; node_modules/.bin/prettier --check <changed files>
git diff --check -- <each changed file>
```

- 真机：窗口高度分别为 56 / 300 / 600 时打开 ⌘K，并覆盖插件 UI 模式、中英文、快捷键。dev Electron 是共享的，先协调，或者交给老板手动验证。
- 不跑 `pnpm run` / `pnpm install`；不动 `CoreBox.vue` / `useSearch.ts`，它们正在被 list-motion 修改，如确有需要先协调。

## 归档说明（2026-09-26）

- 重做和全部后续都已完成、检查通过，已提交到本地 master（`822e97291`、`6994723e0`、`86e394974` 等）。契约见 `.trellis/spec/main-process/corebox-meta-overlay-contracts.md`。
- 真机已看过：面板右下锚定的布局；不需要撑高时不铺底色；关闭后回放布局，522 → 190px。
- **待真机验证**：结果很少、窗口需要撑高时的铺底色（两次尝试都没触发撑高）；Windows / Linux 上的 Ctrl+Shift+. 和「在文件管理器中显示」。
