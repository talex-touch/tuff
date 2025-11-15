# Tuff 打包策略（简化版）

> 适用范围：`apps/core-app`，mac 仅 arm64，Windows/Linux x64。

## 1. 总体思路

1. `electron-vite build` 生成 `out/{main,preload,renderer}`。
2. 直接复用工作区的 `package.json + node_modules`：`electron-builder` 现在以 `apps/core-app` 作为应用目录，自动把 `out/**` 与依赖一起装进 asar。
3. 再由 `electron-builder` 产出平台安装包，mac arm64 附带 ad-hoc 签名与 zip。

**我们不再：**

- 生成 `out/package.json`。
- 手动复制依赖或同步 lockfile。
- 在 build 过程中写入仓库文件。

## 2. 支持平台

| 平台 | 架构 | 产出 | 备注 |
|------|------|------|------|
| macOS | arm64 | 解包目录 + zip（ad-hoc） | 仍需官方签名/Notarize 才能发布 |
| Windows | x64 | `NSIS` 安装包 | artifact name: `tuff-${version}-setup.exe` |
| Linux | x64 | `AppImage` + `deb` | 额外目录 `__appImage-x64` / `__deb-x64` |

## 3. 常用命令

```bash
# Snapshot（自动 publish=never）
pnpm -F @talex-touch/core-app run build:snapshot:mac   # mac arm64
pnpm -F @talex-touch/core-app run build:snapshot:win   # Windows x64
pnpm -F @talex-touch/core-app run build:snapshot:linux # Linux x64

# Release
pnpm -F @talex-touch/core-app run build:release:mac
pnpm -F @talex-touch/core-app run build:release:win
pnpm -F @talex-touch/core-app run build:release:linux
```

### 环境变量

| 变量 | 作用 |
|------|------|
| `BUILD_TARGET` | `win/mac/linux`，脚本会自动设置 |
| `BUILD_TYPE` | `release/snapshot` |
| `BUILD_ARCH` | `arm64/x64`（mac 默认为 arm64） |
| `APP_VERSION` | （可选）覆盖打包版本号，`build-target` 会把 `SNAPSHOT-*` 注入给 `electron-builder` |
| `SKIP_TYPECHECK` | `true` 时跳过 `npm run typecheck` |
| `SKIP_INSTALL_APP_DEPS` | `true` 时跳过 `electron-builder install-app-deps` |

## 4. 流程细节

1. `build-target.js` 会：
   - 检测 beta 版本，自动转成 `SNAPSHOT-x.y.z-n` 并通过 `--config.extraMetadata.version` 注入 electron-builder，无需修改任何 package。
   - 清空 `dist/`，设置 `BUILD_*` 环境变量，执行 `npm run build`（或 `electron-vite build`）。
   - 校验 `out/` 是否存在 `main/preload/renderer`。
   - 运行 `electron-builder install-app-deps`（可通过 `SKIP_INSTALL_APP_DEPS` 跳过）。
   - 调用 `electron-builder --{target}`，构建完成后检查产物是否齐全，并在 mac 上执行 `chmod -> xattr -> codesign - -> zip`。

2. `electron-builder.yml`
   - `directories.app` 指向 `apps/core-app`。
   - `files` 只包含 `out/**`、`resources/**`、`node_modules/**` 和 `package.json`，排除了源码/脚本/文档目录。
   - `asarUnpack` 继续保留对 `@libsql/*`、`*.node` 的解包，保证原生模块可用。

3. CI / 本地无需再 `pnpm install --lockfile-only`，仓库不会因为 build 弄脏。

## 5. 发布注意事项

- mac 正式发布前需要自行 `codesign --sign "Developer ID Application: xxx"` 并 `notarize`。
- Windows 如果需要签名，向 `build-target` 加上 `CSC_LINK/CSC_KEY_PASSWORD` 环境变量即可走 electron-builder 默认流程。
- Linux `AppImage` 需要 `chmod +x` 后才能运行；`deb` 直接用于 apt 安装。

## 6. 故障排查

| 症状 | 检查点 |
|------|--------|
| `electron-builder` 报 `node_modules` 缺失 | 确认 `apps/core-app/node_modules` 存在（`pnpm install`） |
| 产物空目录 | 查看 `dist/` 日志，确认 `build-target` 是否提前报错 |
| mac 打开提示损坏 | 正常，ad-hoc 仅绕过 Gatekeeper，需要右键 + Open 或自行正式签名 |
| Linux 缺少 `AppImage` / `deb` | `dist` 下 `__appImage-x64` / `__deb-x64` 是否生成；若为空，大概率是 electron-builder 未成功执行 |

## 7. 未来扩展

- 如需新增原生依赖，只需 `pnpm install`，不需要维护额外名单。
- 若要支持 x64 mac，只需在 `build-target` 增加 `--arch=x64` 并在 CI 中运行同一脚本，无需再复制依赖。
