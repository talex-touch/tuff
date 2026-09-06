# Implement — 恢复渲染层的窗口类型判定

> P0。可独立于兄弟任务 F2 发布，不必等父任务整体节奏。

## 有序清单

### 步骤 1 — `StartupContext` 携带 `WindowRole`

文件：`packages/utils/preload/loading.ts`

给 `StartupContext`（`:16-20`）加 `role: WindowRole` 字段，从 `../renderer/window-role` 引入类型。
确认该引入不会在 preload 包里引入运行时依赖（`WindowRole` 是纯类型，用 `import type`）。

验证：`pnpm -F @talex-touch/utils exec tsc --noEmit`（或该包既有 typecheck 脚本）

### 步骤 2 — preload 填充该字段

文件：`apps/core-app/src/preload/index.ts`

`resolvePreloadStartupContext`（`:75-90`）已有 `role` 局部变量，放进返回对象：

```ts
return {
  startupInfo,
  metaOverlay,
  role,                    // 新增
  windowMode: resolveRendererWindowMode({ ...role, metaOverlay })
}
```

> 注意 `metaOverlay` 的合成逻辑：返回的 `role` 是 `parseWindowArgs` 的原始结果，
> 其 `metaOverlay` 可能与合成后的顶层 `metaOverlay`（含 hash 判定）不同。
> 消费方应以顶层 `metaOverlay` 为准，`role.metaOverlay` 仅作为 argv 原值保留。
> 若这会造成歧义，改为在放入前用合成值覆盖 `role.metaOverlay`——二选一，需在实现时定并写进注释。

### 步骤 3 — `useArgMapper` 换源并停止缓存空结果（核心修复）

文件：`packages/utils/renderer/hooks/arg-mapper.ts`

按 design.md「改动契约 2」改写取值顺序：缓存命中判定改为"非空才算命中"，
新增 preload 通道优先分支，保留 argv 回退。

需要一个 `roleToArgMapper(role: WindowRole): IArgMapperOptions` 映射函数——
`IArgMapperOptions` 是 camelCase 键的宽对象，`WindowRole` 字段名已经对齐
（`touchType` / `coreType` / `assistantType`），直接展开即可，注意 `metaOverlay`
在 `IArgMapperOptions` 里是 `'true' | 'false'` 字符串而在 `WindowRole` 里是 `boolean`，需要转换。

> ⚠️ **最容易漏的一点**：`window.api` 在 preload 自身的执行上下文里不存在
> （它是暴露给主世界的）。取值必须全程可选链，且 preload 调用 `useArgMapper` 时
> 必须能落到 argv 回退分支——否则会把 preload 侧现在正确的行为改坏。

新增单测 `packages/utils/__tests__/arg-mapper-window-role.test.ts`，覆盖 **AC1 / AC2**：
- 无 `process`、无 `window.api` → 返回空且**不写入缓存**（再次调用仍会重新解析）
- 无 `process`、有 `window.api.getStartupContextSnapshot().role` → 解析出正确 `touchType`
- 有 `process.argv`、无 `window.api` → 走回退，行为与改动前一致（preload 场景）
- `isMainWindow()` 在 `touchType: 'main'` 下为 `true`、`'core-box'` 下为 `false`；`isCoreBox()` 反之
- 缓存非空后不再重复解析（保留原有的缓存收益）

验证：`pnpm -F @talex-touch/utils test`

### 步骤 4 — 类型声明同步

文件：`apps/core-app/src/renderer/src/env.d.ts`（`:24` 已声明 `$argMapper`）

确认渲染层能看到 `window.api` 的类型（`CoreAppPreloadAPI` / `PreloadAPI`）。
若 `getStartupContextSnapshot` 的返回类型未包含新字段，补齐 `PreloadAPI`
（`packages/utils/preload/loading.ts:22-24`）。

验证：`cd apps/core-app && npm run typecheck`

### 步骤 5 — 运行时验证（AC3 / AC4 / AC5）

在 worktree 内跑，不污染主工作区（沿用 OTA 任务的做法）。

1. `node scripts/dev-electron-wrapper.mjs -- --remote-debugging-port=9222` 启动 dev app
2. CDP 求值两个窗口的 `window.$argMapper`，**不做任何注入**：
   主窗口应为 `touchType: 'main'`，CoreBox 应为 `'core-box'`（**AC3**）
3. 导航到 `/setting/update`，点击「检查更新」，日志应出现更新检查记录（**AC4**）
   - 官方源不可达时应出现 `Nexus update lookup failed transiently; falling back to GitHub`
   - 复现不可达用 `https://127.0.0.1:9999`（`ERR_CONNECTION_REFUSED`）；
     **不要用端口 9**，那是 `ERR_UNSAFE_PORT`，属调用方错误，分类器会（正确地）拒绝它
4. 验证提示弹窗路径（**AC5**）：`presentUpdateDialog` 此前在 `:351` 被拦。
   可通过降低本地版本号使主进程检查发现新版本，观察弹窗是否出现。
   > 前置：更新下载会被 F2 阻塞，但**弹窗发生在下载之前**，因此本条不受 F2 影响。

CDP 驱动脚本可复用 `/tmp/ota-ac8-scripts/`（若已清理，按 design 重写一份临时脚本，验证后删除，不入库）。

### 步骤 6 — 安全与回归（AC6 / AC7）

```bash
cd apps/core-app
npx vitest run src/main/core/window-security-profile.contract.test.ts   # AC6：基线未被放宽
npx vitest run src/renderer/src/modules/update src/main/modules/update
npm run typecheck
cd ../.. && pnpm -F @talex-touch/utils test
```

lint 必须在**包内**执行（根配置对 core-app 文件会产生大量假阳性）：

```bash
cd packages/utils && npx eslint --no-cache --max-warnings=0 renderer/hooks/arg-mapper.ts preload/loading.ts
cd apps/core-app && npx eslint --no-cache --max-warnings=0 src/preload/index.ts
```

## 风险文件与回滚点

| 文件 | 风险 | 回滚点 |
|---|---|---|
| `packages/utils/renderer/hooks/arg-mapper.ts` | 改坏 preload 侧现在**正确**的行为（`window.api` 在那里不存在，必须落回 argv） | 步骤 3 后独立可回滚 |
| `apps/core-app/src/preload/index.ts` | `role.metaOverlay` 与合成 `metaOverlay` 的歧义（见步骤 2） | 步骤 2 后独立可回滚 |
| `packages/utils/preload/loading.ts` | 发布包类型变更；新增字段须为增量，不改既有字段 | 步骤 1 后独立可回滚 |

## 待确认

- 提交分支：当前主工作区在 `release/ota-transport-error-classification-20260904`，
  且有另一条线的大量未提交改动。P0 修复应另开分支，需与用户确认基线分支
  （`master` 还是当前发布分支）后再提交。
- 修复后 `isCoreBox()` 首次返回 `true`，可能暴露此前被静默掩盖的 CoreBox 分支行为
  （PRD Out of Scope 已声明不逐一验证）。步骤 5 观察到异常时记录，不在本任务内扩大范围。
