# 代码质量评估报告 2026-02-03

## 范围与方法
- 范围：全仓库抽样（`apps/core-app`、`packages/utils`、`packages/tuffex`、`packages/unplugin-export-plugin`、`plugins/*`）
- 依据：质量门禁配置、测试脚本与部分核心代码抽样
- 采样文件（非穷尽）：`package.json`、`eslint.config.js`、`apps/core-app/tsconfig.node.json`、`apps/core-app/src/main/core/module-manager.ts`、`apps/core-app/src/main/modules/plugin/plugin-module.ts`、`apps/core-app/src/renderer/src/modules/box/adapter/hooks/useKeyboard.ts`、`packages/utils/common/utils/polling.ts`

## 总体结论
整体质量为 **B+（中等偏好）**。基础质量门禁完善、模块化清晰、错误处理在插件通道层较规范；但核心模块缺少统一异常隔离、部分函数过长且职责过多、类型严格度与测试覆盖分布不均，影响可维护性与回归风险控制。

## 现状摘要（证据要点）
- 质量门禁：根 `package.json` 提供 `lint`/`lint:fix`/`lint:staged`，并结合 `lint-staged` 执行 ESLint；`eslint.config.js` 使用 `@antfu/eslint-config`。
- 测试：存在约 38 个 `*.test.ts` 覆盖工具库、tuffex 组件与部分主进程模块；测试框架为 Vitest（多处 `package.json` 与配置文件可见）。
- 类型严格度：`apps/core-app/tsconfig.node.json` 显式 `strict: true`；Web 配置未在当前文件内显式标注（可能来自 `extends`）。
- 核心生命周期：`ModuleManager` 负责模块生命周期，记录日志但在加载/卸载环节未统一 try/catch。
- 插件通道：`PluginModule` 对多数 IPC handler 做参数校验与 try/catch，路径校验较严格（可见路径规范化与越界保护）。
- 渲染器输入：`useKeyboard` 单函数处理大量分支逻辑，复杂度偏高，且含调试日志。

## 优势
1. **质量门禁集中且统一**：lint + lint-staged + commit 约束结构明确，覆盖 apps / packages / plugins。
2. **模块化与生命周期清晰**：`ModuleManager` 定义创建/初始化/启动/销毁流程，便于扩展。
3. **插件通道错误处理规范**：大量 handler 包含参数校验、异常捕获与明确的错误返回。
4. **工具层健壮性较好**：`PollingService` 具备间隔校验、异常保护与执行统计，体现稳定性意识。

## 主要问题（按风险排序）
### Medium / 行为与可维护性风险
1. **生命周期缺少统一异常隔离**  
   `ModuleManager.loadModule` / `unloadModule` 未统一 try/catch，单个模块异常可能中断全链路或留下不一致状态。
2. **超长函数与多职责聚合**  
   `PluginModule.start` 与 `useKeyboard` 逻辑体量过大，职责交错，维护成本高、改动风险大。
3. **测试覆盖分布不均**  
   测试集中在组件与工具包，主应用核心流程（尤其渲染器交互、IPC 互通）覆盖不足。

### Low / 技术债与规范一致性
1. **类型严格度可见性不足**  
   主进程 `strict: true` 明确；Web 侧需确认是否从 `extends` 继承严格度并在文档中说明。
2. **组件副本维护风险**  
   tuffex 组件在 `packages/tuffex` 与 `apps/core-app/packages/tuffex` 出现重复路径，需确认是否为镜像/内嵌依赖，避免双轨维护。
3. **调试日志可能污染生产**  
   渲染器键盘处理函数含多处 `console.log`，建议在生产构建前统一清理或用环境开关控制。

## 可执行改进建议（优先级从高到低）
1. **补齐生命周期异常隔离**  
   - 为 `ModuleManager` 的 created/init/start/stop/destroy 增加统一 try/catch 与失败回滚策略  
   - 输出结构化错误日志，确保模块失败不破坏全局状态
2. **拆分超长函数以降低复杂度**  
   - 将 `PluginModule.start` 按功能域拆分（market / storage / window / widget / dev-server 等）  
   - 将 `useKeyboard` 拆分为键位路由 + UI-mode 转发 + 箭头导航 + ESC 流程处理
3. **提高核心业务测试覆盖**  
   - 为主进程模块（模块管理、插件启停、IPC handler）补充最小单元测试  
   - 对渲染器关键交互增加 Vitest + UI 组件层测试，优先覆盖 CoreBox 关键流
4. **统一类型与质量标准**  
   - 明确 Web/Node tsconfig 严格度来源  
   - 评估是否需要引入覆盖率阈值或至少对核心包开启 `vitest --coverage`

## 需要确认的问题
1. Web 侧严格模式是否由 `extends` 提供？是否计划在配置中显式化？
2. `apps/core-app/packages/tuffex` 是否为镜像依赖？更新策略与来源是否明确？
3. 是否有既定的覆盖率门禁（CI 中是否已有阈值约束）？

