# Tuff Core App

CoreApp is the Electron desktop application in the Tuff monorepo. It owns the
process model, local modules, preload boundary, renderer application, and
packaged application builds.

## Entrypoints

- [Main process](src/main/index.ts): starts Electron and the CoreApp lifecycle.
- [Preload](src/preload/index.ts): exposes the constrained renderer bridge.
- [Renderer](src/renderer/src/main.ts): mounts the Vue application.
- [Electron Vite configuration](electron.vite.config.ts):
  defines main, preload, renderer, and worker build inputs.

## CoreBox 焦点诊断

每次召唤按独立 ID 检查 10 次焦点。首轮在显示后约 200 ms，后续间隔约 100 ms。
检查分别记录原生窗口、WebContents、文档和“万物尽在塔内”搜索输入框的状态。
调用 `focus()`、窗口可见或光标存在，都不能单独代表已取得焦点。

每个样本写入普通日志，并经现有隐私开关和脱敏规则进入 Nexus、Sentry。
有效失焦立即记录 `error`，不等待结束汇总。诊断不采集输入文字、剪贴板、路径或窗口标题。
⌘K、插件视图和流转选择器接管焦点时，按实际合法目标检查。

主动收起和退出应用将剩余样本记为取消，不伪造成功。
退出时在普通模块卸载前终止检查，等待惰性上报入口接收取消记录，再排空 SDK 和既有 Nexus 队列。
离线、服务端配额和传输失败仍适用；本地日志或 `flush()` 完成不能替代远端收件证据。

实现入口：[焦点观察者](src/main/modules/box-tool/core-box/focus-diagnostics.ts)。

## Workspace setup

Run commands from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm core:dev
```

The root `core:dev` command delegates to the CoreApp workspace. The package also
provides scoped commands:

```bash
pnpm -C "apps/core-app" run dev
pnpm -C "apps/core-app" run lint
pnpm -C "apps/core-app" run test
pnpm -C "apps/core-app" run typecheck
pnpm -C "apps/core-app" run build
```

Platform release builds go through `build:target`:

```bash
pnpm -C "apps/core-app" run build:target --target=mac --type=release
```

`--target` selects `win`/`mac`/`linux` (default: this host) and `--type` selects
`beta`/`snapshot`/`release` (default: `release`). Release and signing acceptance
remain separate from a successful local build.

## Architecture

CoreApp is split across Electron boundaries:

- `src/main/` owns lifecycle, persistence, search/indexing, downloads, updates,
  plugins, and other privileged modules.
- `src/preload/` owns the narrow bridge between isolated renderer contexts and
  typed transport.
- `src/renderer/src/` owns Vue views, settings, CoreBox surfaces, and desktop
  interaction.
- Shared events, SDKs, and domain types live in `packages/utils`; reusable UI
  primitives live in `packages/tuffex`.

Maintained module documentation:

- [Download Center](src/main/modules/download/README.md)
- [Search and indexing runtime](src/main/modules/box-tool/search-engine/README.md)
- [Update regression checklist](../../docs/plan-prd/03-features/download-update/update-regression-checklist.md)

## Project documentation

- [Documentation index](../../docs/INDEX.md)
- [Engineering index](../../docs/engineering/README.md)
- [CoreApp UI contract](../../docs/engineering/coreapp-ui-contract.md)
- [Project planning index](../../docs/plan-prd/README.md)

## Contributing

Read the
[repository contribution guide](../../.github/docs/contribution/CONTRIBUTING.md)
before opening a change. Keep privileged behavior in the main process, preserve
the preload boundary, and use the smallest relevant package checks.

## License

CoreApp is distributed under the repository [Mozilla Public License 2.0 (MPL-2.0)](../../LICENSE).
