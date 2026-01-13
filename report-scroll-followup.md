# Settings 滚动诊断复盘（无日志输出）

## 目标
确认为什么已添加的滚动诊断日志在 Settings 页面仍完全无输出，并给出高优先级结论与下一步验证路径。

## 代码事实（已确认）
- ViewTemplate 在 onMounted 时对 `.ViewTemplate` 绑定了 wheel capture 日志，并受 `import.meta.env.DEV` 保护。
  - 文件：`apps/core-app/src/renderer/src/components/base/template/ViewTemplate.vue`
- TouchScroll 作为 ViewTemplate 的滚动包装，内部使用 `@talex-touch/tuffex` 的 `TouchScroll` 组件。
  - 文件：`apps/core-app/src/renderer/src/components/base/TouchScroll.vue`
- TxScroll 的诊断日志位于 tuffex 源码中（mounted 后 150ms 打印）。
  - 文件：`packages/tuffex/packages/components/src/scroll/src/TxScroll.vue`
- core-app 渲染进程的 Vite 配置没有对 `@talex-touch/tuffex` 做源码 alias，仅有 `~/` 与 `assets/`。
  - 文件：`apps/core-app/electron.vite.config.ts`

## 关键结论（优先级最高）
1) **当前运行环境极可能不是 dev 或未使用最新源码**
   - 证据：ViewTemplate 的日志位于 core-app 源码，且只依赖 `import.meta.env.DEV` 与 wheel capture。
   - 如果 Console 完全没有 `[ViewTemplate] wheel captured`，优先怀疑：
     - 运行的是构建产物 / 生产模式（`import.meta.env.DEV` 为 false）。
     - 启动的不是这份源码（旧缓存或另一套路径）。

2) **tuffex 组件很可能未走本地源码**
   - 证据：core-app 渲染进程配置没有为 `@talex-touch/tuffex` 指向 `packages/tuffex/.../src`。
   - 结果：即使你改了 `packages/tuffex/.../TxScroll.vue`，运行时依旧使用 node_modules 中的 build 版本，TxScroll 的诊断日志不会出现。

3) **事件链路可能被“非 ViewTemplate 区域”拦截**（概率低于前两项）
   - wheel capture 绑定在 `.ViewTemplate` 上。
   - 若用户实际滚动区域不在 `.ViewTemplate` DOM 树下（例如顶层遮罩或另一个窗口/层级拦截），则事件不会触发该日志。

## 对“滚动闪一下回弹”的直接推断
- 只要 `maxScrollY >= 0`（尤其 = 0），BetterScroll 会判定无可滚动空间并回弹。
- 目前无法得到 `maxScrollY` 日志，说明 **诊断日志根本没有执行**，优先解决“日志未执行”的根因，而非滚动参数本身。

## 最小验证路径（从高到低）
1) **确认运行模式**：确保 renderer 处于 dev（`import.meta.env.DEV` 为 true）。
2) **确认启动的是当前源码**：是否从该仓库路径启动，且 dev server 指向 `apps/core-app/src/renderer`。
3) **确认 tuffex 是否走源码**：若要验证 TxScroll 日志，需为 `@talex-touch/tuffex` 增加本地 alias 或使用 workspace link。

## 结论摘要
- “完全无日志输出”优先说明 **代码根本未运行或处于生产模式**。
- 其次是 **tuffex 源码未被使用**，导致 TxScroll 日志不会出现。
- 在未解决“日志未触发”前，无法对 `maxScrollY`/高度链路做有效判读。
