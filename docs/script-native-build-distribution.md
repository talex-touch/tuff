# 脚本/原生运行时构建与分发集成

## Scope
- 将脚本运行时与原生资产纳入构建、签名/公证、更新与回滚流程。
- 明确打包目录、资源布局、构建入口与发布策略。

## Summary
- 现有构建基于 `electron-builder`，输出目录为 `dist/`，资源来自 `out/` 与 `resources/`。
- 运行时资产以 `resources/` 为主路径，配合 `asarUnpack`/`extraFiles` 保证可执行与动态库可用。
- 更新分发沿用 `UpdateSystem` 与发布流水线，不新增独立下载通道。

## References
- docs/updates-module.md
- plan/planprd-release-pipeline.md
- apps/core-app/electron-builder.yml
- apps/core-app/scripts/build-target.js
- apps/core-app/src/main/modules/update/UpdateService.ts
- apps/core-app/src/main/modules/update/update-system.ts

---

## 1) 构建与更新基线

构建脚本（apps/core-app/package.json）：
- `pnpm core:build` → `electron-vite build`
- `pnpm core:build:snapshot|release` → `scripts/build-target.js`

打包输出（electron-builder.yml）：
- `directories.output: dist`
- 入口产物：`out/**`、`resources/**`、`package.json`、`node_modules/**`
- 默认 `asar: true`，`asarUnpack` 已包含 `*.node / *.dylib / *.dll / *.so`

更新分发（UpdateSystem）：
- 通过 GitHub Release + DownloadCenter 下载更新包。
- 校验 SHA256 / 签名后安装；与现有更新逻辑兼容，不引入新通道。

---

## 2) 资源布局与打包目录

推荐资源路径（主进程读取 `process.resourcesPath`）：

| 目录 | 说明 | 打包策略 |
| --- | --- | --- |
| `resources/runtime/python/<platform>/<arch>/` | 嵌入式 Python 运行时 | `asarUnpack` 或 `extraFiles` |
| `resources/native/<platform>/<arch>/` | 原生 sidecar / dll / dylib / so | `asarUnpack` |
| `resources/scripts/` | 内置脚本模板 | 可保留在 asar |

注意事项：
- 可执行文件与动态库应避免打进 asar，保证加载与权限正常。
- 现有 `asarUnpack` 已覆盖 `*.dll/*.dylib/*.so/*.node`；如引入可执行二进制，需扩展配置或使用 `extraFiles`。

---

## 3) 构建流程接入点

`scripts/build-target.js` 负责：
- 统一 `buildType` 与 `publish` 策略（snapshot 默认 `--publish=never`）。
- `dist/` 与 `out/` 产物检查，避免静默失败。
- macOS 场景有 ad-hoc 签名流程（仅用于规避“损坏应用”提示，不替代正式签名）。

接入方式建议：
1. 运行时资源复制到 `resources/`（构建前）。
2. 保证 `electron-builder.yml` 中包含 `resources/**`。
3. 如需平台差异化资源，按 `<platform>/<arch>` 组织。

---

## 4) 签名与公证策略

macOS:
- Release 构建需启用正式签名 + notarize（当前配置 `sign/notarize` 关闭，仅适用于非发布测试）。
- 运行时二进制需包含在签名范围内（避免加载失败）。

Windows:
- 主安装包与运行时二进制建议使用 Authenticode 签名。
- Sidecar/DLL 未签名可能触发安全拦截或 SmartScreen 风险。

Linux:
- 通常不做签名，依赖 SHA256 校验与下载源可信度。
- AppImage/DEB 发布需明确校验文件与版本标识。

---

## 5) 更新、开关与回滚

更新分发：
- 与应用更新包一起发布，避免额外下载链路。
- 运行时版本与应用版本绑定，确保兼容性。

Feature Flag（运行时开关）：
- `config/script-bridge.json` 控制运行时启用与允许的 provider。
- 运行时缺失/校验失败 → 自动降级并记录告警日志。

回滚策略：
- 运行时加载失败立即禁用对应 provider（不影响主流程）。
- 通过更新发布修复版本，或将 `enabled=false` 作为紧急关闭。

---

## 6) 交付清单（构建与发布侧）

- 运行时资源目录已加入 `resources/**`。
- `asarUnpack` 覆盖新增动态库/可执行文件（必要时使用 `extraFiles`）。
- Release 构建启用签名/公证并包含运行时资产。
- 更新包包含运行时，下载与校验流程不变。

---

## 7) 验证要点（与回归检查对齐）

- `pnpm core:build:snapshot` 与 `pnpm core:build:release` 输出包含运行时文件。
- macOS/Windows 安装后运行时可被发现且能执行（路径解析无误）。
- 关闭开关后系统稳定运行（功能降级一致、无启动异常）。
