# 执行计划

顺序照 proposal §7（第 6 步推理强度已由子任务完成）。每一步做完跑对应单测再进下一步。

1. [x] tuffex：`liquid/index.ts` 导出 `resolveTransition`，文档补一句；拿 `/tmp/tuffex-build.lock` 构建 dist（`node ./node_modules/gulp/bin/gulp.js -f packages/script/build/index.ts`，带 `npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false`），构建完删锁。
2. [x] `composer/send-state.ts`（`deriveSendState`、`isAwaitingFirstToken`，含 D10-d 的听写分支）、`composer/composer-motion.ts`（proposal §4 参数表 + 编译好的曲线）、`composer/useComposerPress.ts` + 单测。
3. [x] `ComposerControl` / `ComposerChip` / `ComposerModelPill` / `ComposerSendIsland`（圆 ↔ 72px「■ 停止」胶囊，T1–T8）/ `ComposerMic`（含 D10-f 听写胶囊）/ `ComposerToolbar`；`HomePermissionMenu` 的触发器换成 `ComposerChip`。
4. [x] 听写：`dictation-text.ts`、`voice-level.ts`、`useComposerDictation.ts` + 单测（`dictation.md` §4.11）；规范补 D10-a 的范围一句（`voice-session-contracts.md`）。
5. [x] **最后**才改 `HomePage.vue`（别的会话也在改它，只用 Edit 做局部替换，不整文件重写）：接 `ComposerToolbar`、`useComposerDictation`、`sendState`、`submit()` 里的 `launch()`、`watch(isStreaming)`；推理强度三处接线（`09-26-reasoning-effort/prd.md`「HomePage hand-off」）；删旧工具栏样式、`fileInputRef` / `onFilePick`、`home.effortHigh`（两份语言包一起删，语言包只动自己的键）。
6. [x] 包内 eslint、prettier、`vue-tsc -p tsconfig.web.json --composite false`、相关 vitest；`git diff --check`。

## 验证（主会话在真实窗口做）

- 亮 / 暗各走 T1–T8（普通发送、首条发送各一次）；T3 / T5 期间逐帧采样模型胶囊、权限胶囊、`+` 的矩形，位移 ≤ 0.5px；胶囊宽度峰值与回落。
- 发送 → 停止 → 发送全程焦点不丢；听写一轮（开始、partial、结束、光标位置、听写胶囊盖住模型胶囊且邻居不动）、听写中点发送 = 结束并发送、拒绝权限的提示。
- 切一次推理强度看胶囊后缀与回合信息；开「减少动态效果」再走一遍。

## 高风险文件

- `HomePage.vue`：多个会话同时在改；只做局部 Edit。
- 语言包 `zh-CN.json` / `en-US.json`：只增删本任务的键，JSON 按原格式写回（`json.dumps(indent=2, ensure_ascii=False)`）。
- tuffex dist 构建：共享产物，必须拿锁。
