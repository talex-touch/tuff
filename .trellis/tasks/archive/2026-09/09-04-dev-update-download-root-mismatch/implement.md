# Implement — 统一 app root 的单一来源

## 前置

先读 design.md 的「消除重复的规则定义」一节——`packageJson.name` 在 `polyfills.ts` 与
`version-util.ts` 里相对路径深度不同，磁盘上已因此分裂出两个目录。统一来源时必须**显式选定**
用哪个包名，选错会再次分裂。

## 有序清单

### 步骤 1 — 查清包名歧义（先做，其余步骤依赖此结论）

```bash
cd apps/core-app
node -e "console.log('polyfills 侧:', require('../../package.json').name)"          # 相对 src/main/
node -e "console.log('core-app 侧:', require('./package.json').name)"
ls -d ~/Library/Application\ Support/@talex-touch/*/
```

确认 `polyfills.ts:7` 的 `import packageJson from '../../../../package.json'` 实际解析到哪个文件
（构建后的 bundle 里可能与源码路径直觉不同——磁盘证据显示日志落在 `@talex-touch/core-app/…`，
而 Chromium 数据落在 `@talex-touch/tuff-dev`，两者不一致）。

把结论写进 `app-root-path.ts` 的注释——这是本任务最容易被后人推翻的一处判断。

### 步骤 2 — `app-root-path.ts` 成为唯一来源

文件：`apps/core-app/src/main/utils/app-root-path.ts`

1. 新增 `resolveUserDataPath(app)`：`isPackaged` 时返回 `app.getPath('userData')`；
   否则按步骤 1 选定的包名推导 `path.join(app.getPath('appData'), \`${name}-dev\`)`。
2. `resolveRuntimeRootPath` 改为基于 `resolveUserDataPath` 求值，并记忆化。
3. 导出 `resolveUserDataPath` 供 `polyfills.ts` 复用。

记忆化要留一个仅测试可见的重置入口（或用依赖注入形式接收 `app`），
否则步骤 4 的"改写后仍返回同值"用例无法在同一进程内构造两种状态。

### 步骤 3 — `polyfills.ts` 复用同一规则

文件：`apps/core-app/src/main/polyfills.ts`（`:10-15`）

`setPath('userData', …)` 的目标路径改为调用 `resolveUserDataPath(app)`，删除本地硬编码的
`path.join(app.getPath('appData'), \`${packageJson.name}-dev\`)`。

> 保留 `setPath` 本身——Chromium 数据仍需落在 dev 目录。本步骤只是让它与 root 解析同源。

⚠️ 注意循环引入：`app-root-path.ts` 若引入了 `polyfills` 侧的东西会成环。保持前者零依赖
（只依赖 `node:path` 与传入的 `app`）。

### 步骤 4 — 单测（AC1 / AC2）

新增 `apps/core-app/src/main/utils/app-root-path.test.ts`：

- **AC1 核心用例**：先调用一次 `resolveRuntimeRootPath`，再模拟 `app.setPath('userData', …)`
  改写（用 stub app 对象即可），第二次调用**必须返回同一值**。
  这条用例在修复前会失败——先确认它确实失败，再修，否则无法证明它有效。
- dev / packaged 两种 `isPackaged` 下的取值符合预期。
- 写入方与校验方一致：`path.join(root, 'modules', 'update-packages')` 落在
  `getAllowedDownloadRoots()` 的某个根之下。

扩展 `download-target-policy` 既有测试（**AC2**）：更新包目标返回 `allowed: true`；
既有的 `unsafe-filename` / `destination-not-absolute` / `destination-outside-roots`
拒绝用例行为不变。

验证：`cd apps/core-app && npx vitest run src/main/utils/ src/main/modules/update`

### 步骤 5 — 防回归静态检查（AC7）

新增 `scripts/check-app-root-single-source.mjs`，比照仓库既有模式
（`check-search-index-writers.mjs` / `check-permission-api-mappings.mjs`，都带 `--self-test`）：

- 断言 `app.getPath('userData')` 在 `apps/core-app/src/main` 内只出现在 `app-root-path.ts`
- 提供 `--self-test`：构造一个违规样本，确认脚本会失败（否则这个检查本身可能永远为真）

在 `package.json` 加 `check:app-root-single-source` 与 `:self-test` 两个脚本，
与既有 check 脚本并列。

> 这一步是 AC7 的全部内容。没有它，本次只修好了当前这一例，
> 下次新增第二处独立求值不会有任何东西失败。

### 步骤 6 — 运行时验证（AC3 / AC4 / AC6）

在 worktree 内跑。**注意 dev 数据目录会换位置**，首次启动会像全新环境（design.md 已说明）。

1. 启动 dev app，确认日志、配置、数据库都落在同一个 root 下（**AC6**）：
   ```bash
   ls -d ~/Library/Application\ Support/@talex-touch/*/
   ```
   不应再出现 `core-app/tuff-dev` 与 `tuff-dev` 各持一部分数据的分裂。
2. 触发更新下载（**AC3**）：日志无 `destination-outside-roots`，
   产物实际落盘到 `<root>/modules/update-packages`。
3. 下载完成后 sha256 与 `.sig` 校验通过，生命周期进入 `ready`（**AC4**）。

> **依赖 F1**：dev 下「检查更新」按钮当前是死的（兄弟任务 `09-04-dev-update-check-noop`）。
> 若 F1 尚未合入，本步骤需用 CDP 注入 `window.$argMapper = { touchType: 'main' }` 绕过，
> 并在验收记录里注明该注入——F1 合入后应复跑一次确认无需注入。
> 复现官方源不可达用 `https://127.0.0.1:9999`（`ERR_CONNECTION_REFUSED`），
> **不要用端口 9**（`ERR_UNSAFE_PORT` 是调用方错误，分类器会正确拒绝）。

### 步骤 7 — 全量校验（AC5）

```bash
cd apps/core-app
npx vitest run src/main/utils src/main/modules/update src/main/modules/download
npm run typecheck
node ../../scripts/check-app-root-single-source.mjs
node ../../scripts/check-app-root-single-source.mjs --self-test
```

lint 在包内执行（根配置对 core-app 文件会产生假阳性）：

```bash
cd apps/core-app && npx eslint --no-cache --max-warnings=0 src/main/utils/app-root-path.ts src/main/polyfills.ts
```

## 风险文件与回滚点

| 文件 | 风险 | 回滚点 |
|---|---|---|
| `app-root-path.ts` | 包名选错 → dev 数据目录再次分裂；记忆化后测试间状态泄漏 | 步骤 2 后独立可回滚 |
| `polyfills.ts` | 与 `app-root-path.ts` 成环；改错则 Chromium 数据与 app 数据再次错位 | 步骤 3 后独立可回滚 |
| 检查脚本 | 写成永远为真的空检查 —— `--self-test` 就是为此存在 | 步骤 5 后独立可回滚 |

## 待确认

- 提交分支：与 F1 同一问题——主工作区当前分支上有另一条线的大量未提交改动，需先与用户确认基线分支。
- dev 数据目录迁移：本任务只保证今后一致，旧目录（`@talex-touch/core-app/tuff-dev`）保留不动。
  是否需要一次性迁移或提示开发者清理，PRD 已列为 Out of Scope，如需处理请另开单。
