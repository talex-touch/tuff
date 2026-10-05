# 重新构建与重新组合

这份说明面向拿到 Tuff 安装包的用户。读完后，你可以修改 `@talex-touch/pi-desktop-reuse`（以下简称“本库”），用修改后的本库重新构建 Tuff 的主进程、preload 和渲染层，并在不使用任何发行签名凭据的情况下运行结果。

本库以 LGPL-3.0-only 发布，来源是 PI-Desktop 固定提交 `3b036cc7810e18b3ef7689a2b93385125a8d0a3f`。文件级映射见 `sources.json`，署名与许可说明见 `NOTICE`。

## 许可边界

electron-vite 会把本库直接编译进主进程、preload 和渲染层三个产物。本库没有以可单独替换的共享库形式发布，所以 Tuff 不适用 LGPL 第 4(d)(1) 条。

Tuff 按第 4(d)(0) 条交付：每个安装包都附带本库的最小对应源码，以及与本库一起构建的对应应用代码。应用代码继续使用各自声明的许可。根目录 `LICENSE` 是 MPL-2.0；部分工作区包（例如 tuffex）在自己的 `package.json` 或 `LICENSE` 中声明 MIT。这些许可都允许修改和重新组合。

## 交付物位置

安装包内的文件位于资源目录的 `legal/pi-desktop-reuse/`：

| 平台 | 资源目录 |
|---|---|
| macOS | `tuff.app/Contents/Resources/` |
| Windows | 安装目录下的 `resources\` |
| Linux（deb） | `/opt/tuff/resources/` |
| Linux（AppImage） | 解包后的 `squashfs-root/resources/` |

构建树中的同一组文件位于 `apps/core-app/out/legal/pi-desktop-reuse/`。

| 文件 | 内容 |
|---|---|
| `LICENSE` | GNU LGPL v3 全文 |
| `COPYING` | GNU GPL v3 全文 |
| `NOTICE` | 上游、署名和修改说明 |
| `BUILDING.md` | 本文件 |
| `sources.json` | 每个文件对应的上游路径、git blob、上游 SHA-256 和修改说明 |
| `corresponding-source.tar.gz` | 源码快照 |
| `corresponding-source.tar.gz.sha256` | 快照的 SHA-256 |
| `source-manifest.json` | 快照中每个文件的 SHA-256、大小和构建角色，本库每个文件的导入方，以及对应的 main、preload、renderer 产物摘要 |

快照只用 SHA-256 标识，不对应任何 Git 提交或下载地址。

## 快照包含什么

快照中的文件全部来自实际构建，不是手工维护的清单。`source-manifest.json` 的 `roles` 字段标出每个文件的来源：

| 角色 | 来源 |
|---|---|
| `lgpl-module` | 本库的 `package.json`、许可文件和 `src/` 下全部已映射文件 |
| `build-module` | electron-vite 构建 main、preload、renderer 时实际加载的工作区文件 |
| `build-input` | 渲染层 `index.html`；构建时存在 `packages/tuffex/dist/es/style-deps.json` 的话，也包含这个由 tuffex 按需样式插件读取的文件 |
| `build-config` | `electron.vite.config.ts`、`uno.config.ts` 及其相对导入、相关 tsconfig 链和 `electron-builder.yml` |
| `workspace-manifest` | 根 `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`.node-version`，以及 lockfile 中 `apps/core-app` 经 `link:` 可达的全部工作区包的 `package.json` |
| `install-patch` | `pnpm-workspace.yaml` 中 `patchedDependencies` 引用的补丁 |
| `license` | 根 `LICENSE` 和上述工作区包自带的许可文件 |
| `public-asset` | 构建复制的 public 目录文件（存在时） |

第三方 npm 依赖不在快照中，按 lockfile 安装即可得到相同版本。

构建插件在内存中生成的模块没有对应文件，例如 UnoCSS 的 `__uno.css`，所以不放进快照。`source-manifest.json` 的 `virtualModules` 字段列出这些模块和生成它们的插件，重新构建时它们会根据快照中的 `uno.config.ts` 和被扫描的源码重新生成。只有 UnoCSS 插件自己声明的虚拟模块 id 能这样处理；其他在磁盘上找不到的模块仍会让构建失败。

快照始终排除以下内容：`node_modules`、`.git`、`.comet`、`.trellis`、`docs/comet/`、编辑器和 Agent 配置目录、`logs`、`profiles`、运行时资料目录 `apps/core-app/tuff/`、`.env*`、`.npmrc`、`.netrc`、日志文件，以及私钥、证书、描述文件和凭据文件。如果构建实际加载了被排除的文件，构建会直接失败，不会生成缺文件的快照。

## 校验快照

在 `legal/pi-desktop-reuse/` 目录中执行：

```sh
shasum -a 256 -c corresponding-source.tar.gz.sha256   # macOS
sha256sum -c corresponding-source.tar.gz.sha256       # Linux
```

Windows 可以用 `certutil -hashfile corresponding-source.tar.gz SHA256`，再与 `.sha256` 文件中的值比对。

## 环境要求

- Node.js 26.0.0 或更高版本。根 `package.json` 的 `engines.node` 是 `>=26.0.0`，`.node-version` 固定为 `26.0.0`。
- pnpm 11.24.0，与根 `package.json` 的 `packageManager` 一致。Node.js 26 不再自带 Corepack，可以用 `npm install --global pnpm@11.24.0` 安装。
- 不需要 Apple Developer ID、公证账号、Windows 证书、Sentry 令牌或任何 `.env` 文件。不要设置 `SENTRY_UPLOAD_SOURCEMAPS` 和 `SENTRY_AUTH_TOKEN`。

## 重新组合到已安装的 Tuff

这条路线只需要快照，用重新构建的三个产物替换已安装应用中的对应目录。

**（1）解包并修改本库**

```sh
mkdir tuff-recombine && cd tuff-recombine
tar -xzf /path/to/corresponding-source.tar.gz
cd tuff-pi-desktop-reuse-source
```

在 `packages/pi-desktop-reuse/src/` 中修改本库。新增或改名文件时，同时更新 `sources.json` 和 `NOTICE`，并保留文件头中的 SPDX 标识、署名（`PI-Desktop contributors`）、原有版权声明、固定提交和上游路径。缺少映射、文件头或许可文件时，下一步的构建会失败。

**（2）安装依赖并构建**

```sh
pnpm install --frozen-lockfile --ignore-scripts --filter "@talex-touch/core-app..."
pnpm -C apps/core-app exec electron-vite build
```

`--ignore-scripts` 跳过 Electron 二进制下载、原生模块编译和仓库维护脚本；重新构建三个产物不需要它们，已安装的 Tuff 已包含这些运行时文件。构建结束时会为你的版本重新生成 `apps/core-app/out/legal/pi-desktop-reuse/`。

**（3）替换应用内容**

以 macOS 为例，先退出 Tuff，然后执行：

```sh
APP=/Applications/tuff.app
RES="$APP/Contents/Resources"
pnpm -C apps/core-app exec asar extract "$RES/app.asar" "$RES/app"
rm -rf "$RES/app/out/main" "$RES/app/out/preload" "$RES/app/out/renderer"
cp -R apps/core-app/out/main apps/core-app/out/preload apps/core-app/out/renderer "$RES/app/out/"
rm -rf "$RES/legal/pi-desktop-reuse"
cp -R apps/core-app/out/legal/pi-desktop-reuse "$RES/legal/pi-desktop-reuse"
mv "$RES/app.asar" "$RES/app.asar.orig"
codesign --force --deep --sign - "$APP"
```

Electron 找不到 `app.asar` 时会加载同目录下的 `app/`。`app.asar.unpacked` 保持原位。最后一行用临时（ad-hoc）签名替换原签名，不需要证书。

Windows 和 Linux 的步骤相同，只是资源目录不同，也不需要 `codesign`。AppImage 先用 `./tuff-*.AppImage --appimage-extract` 解包，修改 `squashfs-root/resources/` 后运行 `squashfs-root/AppRun`。

## 从完整仓库打无签名安装包

快照不包含内置插件、图标等打包资源，所以这条路线需要完整的 Tuff 仓库。把快照覆盖到仓库对应位置后执行：

```sh
pnpm install --frozen-lockfile
pnpm -C apps/core-app exec electron-vite build
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm -C apps/core-app exec electron-builder --dir --publish never \
  -c.mac.identity=null -c.mac.notarize=false
```

Linux 和 Windows 分别把 `--dir` 换成 `--linux --dir` 和 `--win --dir`，并去掉两个 `-c.mac.*` 参数。

不要用 `scripts/build-target.js` 做重新组合。它在 macOS 上默认按正式发行处理，强制 Developer ID 签名和公证。

## 构建门禁

下面三个检查点任何一个失败都会中止构建，不会降级为警告：

| 时机 | 检查内容 |
|---|---|
| electron-vite 构建结束 | 许可文件齐全；`src/` 下每个文件都在 `sources.json` 中有映射，文件头与映射一致，`NOTICE` 列出全部映射；非纯类型文件必须被至少一个产物实际加载；快照文件不得越出工作区或命中排除规则 |
| electron-builder `beforePack` | 交付目录存在且由生成器创建；许可文件与本库一致；归档内容与 `source-manifest.json` 逐个文件一致；`out/main`、`out/preload`、`out/renderer` 与生成快照时的产物摘要一致。直接运行 electron-builder、跳过 electron-vite 构建时会在这里失败 |
| electron-builder `afterPack` | 安装包资源目录中的 `legal/pi-desktop-reuse/` 与构建树中的交付物逐字节一致 |

维护者可以在 `apps/core-app` 中手动运行同一组检查：

```sh
node scripts/legal/pi-desktop-reuse-legal.cjs check
node scripts/legal/pi-desktop-reuse-legal.cjs verify
node scripts/legal/pi-desktop-reuse-legal.cjs reproduce --out /tmp/tuff-legal-reproduce
```

`check` 只校验本库的许可和映射。`verify` 执行 `beforePack` 的全部检查。`reproduce` 按 `source-manifest.json` 从当前文件重新生成归档，要求与原归档字节一致，然后写到系统临时目录、`/tmp` 或 `apps/core-app/out/` 下的新目录；目标目录已存在且不是生成器创建的，命令会拒绝写入。

## 修改宿主适配代码时的不变量

本库提供队列排序、模型能力解析、消息流与审阅计算；Tuff Main 持有会话、凭据、项目路径和授权，不由本库或 renderer 重新建立这些权威。

- 待发送队列最多 8 项。停止或冷启动后保留输入且暂停，用户明确继续前不能重放模型请求或工具。
- 发送按钮按下时冻结会话、profile、模型、推理值、新会话项目和标题。附件异步编码后的页面选择不能改写这份提交。
- 首条消息只对工作标题生成有界 Unicode 前缀，正文保持完整。重新加载后，工作标题仍可被自动生成的标题替换。页面层也持有发送与导航令牌，迟到拒绝、队列完成和动画清理不得改写其他会话的输入、附件或路由。
- 队列“下一条”使用原生可聚焦按钮，支持从行按 Tab 进入并用 Enter 执行；Alt+ 方向键调序和 Delete 删除保留原语义。
- 会话分支重映射 Tuff 消息与工具身份；Pi 分支另建原生 JSONL、pointer 和 lease。子分支继承的文件审阅只用于阅读，不携带源会话的回滚权利。
- 文件快照区分缺失与零字节内容。回滚先核验所有端点的完成后 hash 和当前授权，后续编辑与 symlink 漂移必须拒绝；不能把部分恢复报成全部成功。
- 回滚批准后重新读取 profile、项目和会话归属，并在每个逆操作写盘前再次校验。等待期间撤权或新活动 turn 都必须拒绝；多路径中途撤权只报告已经恢复的路径。
- Gateway 工具确认与 orchestrator 运行确认保持各自身份。Gateway 最长等待由共享 `AGENT_TOOL_CONFIRMATION_TIMEOUT_MS` 定义；等待审批的回滚 RPC 比该期限多留 15 秒，普通读取请求仍使用原期限。未收到回滚回复只能报告结果未确认，不能断言文件没有变化。
- 持久化和发往 renderer 的工具输入、输出与未完成参数日志均脱敏；8 KiB 文本边界按 UTF-8 字节计算，不截断 Unicode 字符。最终答案替换临时文本时保留已完成工具证据。
- 流帧只更新宿主已接纳的活动回合及其未终结消息。重载后的终态不接受迟到 delta 或 snapshot；宿主已写入消息终态、尚未清空活动回合时也不能重开回答。
- Home/Agent 的本轮输入由现有 ContextHygiene 准备为 `light`、`noHistory` 包，实际 package log 和 session checkpoint 才投影到面板。历史、系统规则和安全附件保持 Main/Pi 原有归属，不用该包估算完整模型上下文。删除会话只清理 owner、actor 和会话身份都匹配的宿主上下文记录。
- 上下文准备只补充 `contextExecution`，保留调用方身份和宿主用途标记。上下文 actor 单独持久化，不写成 Provider 的 `caller`，也不清除原有 caller 声明；Pi 原生聊天的身份拒绝规则保持不变。
- 设置页的有效窗口和输出上限中，用户值保持固定；目录值读取 Main 最新解析结果，不能被本地保存的旧目录值覆盖。Main 未提供该模型时沿用共享解析，未知值仍标为未知。
- Anthropic 的调用方和模型输出上限都约束最终请求。旧版 extended thinking 的预算至少 1024 tokens 且必须低于输出上限；冲突时拒绝请求，不自动增加上限或关闭显式推理。
- 隔离 Electron 验证在最早的 `polyfills` 阶段同时设置 `userData` 和 `sessionData`，不能只隔离业务 SQLite 而继续使用真实开发 profile 的 Chromium 缓存。

