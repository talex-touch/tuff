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
| `SKIP_INSTALL_APP_DEPS` | `true` 时跳过 `electron-builder install-app-deps` |
| `RELEASE_SIGNING_PRIVATE_KEY` | GitHub Actions secret；为发布包内构建证明及发布资产 `.sig` 签名，禁止写入仓库或日志 |
| `TUFF_RELEASE_ATTESTATION_REQUIRED` | CI 发布构建固定为 `true`；缺少或错配签名私钥时在 `afterPack` 阶段 fail closed |

## 4. 流程细节

1. `build-target.js` 会：
   - 保留 package 中的完整版本（包括 `-beta.N` / `-snapshot.N`），不改写发布身份。
   - 清空 `dist/`，设置 `BUILD_*` 环境变量，执行 `npm run build`（包含 typecheck + electron-vite build）。
   - 校验 `out/` 是否存在 `main/preload/renderer`。
   - 调用 `scripts/ensure-platform-modules.js` 把 libsql 平台二进制同步到 `apps/core-app/node_modules`。
   - 运行 `electron-builder install-app-deps`（可通过 `SKIP_INSTALL_APP_DEPS` 跳过）。
   - 调用 `electron-builder --{target}` 并检查产物；mac 本地构建保留 ad-hoc 兼容后处理，`TUFF_OFFICIAL_RELEASE_BUILD=true` 时强制 Developer ID、hardened runtime 与 notarization，禁止后处理覆盖官方签名。
   - `afterPack` 在所有资源同步/裁剪完成后哈希物理 `app.asar`，生成签名的 `build-attestation.json` 与 `.sig`；本地无私钥构建显式跳过，CI 构建强制成功生成。

2. `electron-builder.yml`
   - `directories.app` 指向 `apps/core-app`。
   - `files` 只包含 `out/**`、`resources/**`、`node_modules/**` 和 `package.json`，排除了源码/脚本/文档目录。
   - `asarUnpack` 继续保留对 `@libsql/*`、`*.node` 的解包，保证原生模块可用。

3. CI / 本地无需再 `pnpm install --lockfile-only`，仓库不会因为 build 弄脏。

## 5. 发布注意事项

- GitHub Actions 官方发布仍必须配置 `RELEASE_SIGNING_PRIVATE_KEY`，用于三平台 detached signature；这与 Apple Developer 无关，不能豁免。
- 当前 GitHub secret `RELEASE_SIGNING_PRIVATE_KEY` 已轮换为 RSA-4096；CoreApp/Nexus 固定公钥 SHA-256 指纹为 `a340b58cff2413f11c64b406fa745e76910759d19a211b72d176686b021fb2ed`。私钥只存在于 GitHub Actions secret，仓库只保留公钥。
- Nexus Cloudflare fallback 从 `server/utils/releaseSigningPublicKey.mjs` 内嵌；`scripts/check-release-signing-trust-roots.mjs` 在收集发布资产前比较 CoreApp PEM、Nexus resource/server PEM 与 worker fallback 的 SPKI 指纹，任一漂移都会阻断 Release。
- CoreApp 启动时离线验证包内签名、版本/平台/架构身份和物理 `app.asar` SHA-256；仅全部通过时上报 `isOfficialBuild=true`。Electron 的 ASAR 虚拟文件系统不能直接哈希归档本体，因此运行时必须经 `original-fs` 读取。
- 在仓库 owner 明确说明 Apple Developer 已配置之前，macOS 默认进入 `waived`：允许 ad-hoc 包发布，但 summary 固定记录 `apple-developer-not-configured` 与 `macosNativeTrust: waived`，不得宣称 Gatekeeper 通过。
- 未来若完整配置 `CSC_LINK` / `CSC_KEY_PASSWORD` 与一组 Apple notarization 凭据，workflow 自动切换到 `developer-id` 严格门禁；任何部分配置都会 fail closed。
- create-release job 为全部 CoreApp 安装包生成 RSA-SHA256 `.sig`，验证私钥与仓库固定公钥一致，只把每个 `platform/arch` 的首选资产写入 manifest，并生成 `release-test-summary.json` / `.md`。
- Windows Authenticode 与 Linux 包仓库级签名仍不在当前流水线内；三平台都由 detached signature 保护。

## 6. 故障排查

| 症状 | 检查点 |
|------|--------|
| `electron-builder` 报 `node_modules` 缺失 | 确认 `apps/core-app/node_modules` 存在（`pnpm install`） |
| 产物空目录 | 查看 `dist/` 日志，确认 `build-target` 是否提前报错 |
| macOS summary 显示 `waived` | 这是当前 owner 明确接受的 Apple Developer 风险豁免；不要重复要求购买/配置，直到 owner 主动说明已配置 |
| Apple secrets 配置后构建前失败 | 检查 `CSC_LINK` / `CSC_KEY_PASSWORD` 与所选 notarization 组是否全部完整；部分配置禁止回退到 `waived` |
| 发布资产准备失败 | 检查 `RELEASE_SIGNING_PRIVATE_KEY` 对应公钥是否与 `resources/keys/release-signing-public.pem` 一致 |
| 发布信任根检查失败 | 运行 `node scripts/check-release-signing-trust-roots.mjs`；四个来源必须同时解析为指纹 `a340b58cff2413f11c64b406fa745e76910759d19a211b72d176686b021fb2ed` |
| 应用显示非官方/构建证明失败 | 检查包内 `build-attestation.json(.sig)`、嵌入公钥指纹及 `app.asar` 摘要；CI 缺证明应视为构建失败，不允许手工补签后发布 |
| mac 包打开提示损坏 | `waived` 模式是 ad-hoc 包且不具备 Gatekeeper 原生信任；该限制必须保留在 release summary |
| Linux 缺少 `AppImage` / `deb` | `dist` 下 `__appImage-x64` / `__deb-x64` 是否生成；若为空，大概率是 electron-builder 未成功执行 |

## 7. 未来扩展

- 如需新增原生依赖，只需 `pnpm install`，不需要维护额外名单。
- 若要支持 x64 mac，只需在 `build-target` 增加 `--arch=x64` 并在 CI 中运行同一脚本，无需再复制依赖。
