# GitHub Release 资产与 Manifest 规范

## 1. 目标

统一 core/renderer/extensions 的 Release 资产命名与校验规则，确保 UpdateSystem 与 GithubUpdateProvider 可在无需隐式猜测的情况下解析平台/架构/sha256/签名信息，并支持向后兼容旧资产。

## 2. 资产命名规则

### 2.1 Core App

命名格式：

```
tuff-core-{version}-{platform}-{arch}{-setup?}.{ext}
```

- `version`：发布版本号（包含渠道后缀，如 `2.4.7-beta.11`）
- `platform`：`win32` | `darwin` | `linux`
- `arch`：`x64` | `arm64`
- `ext`：`exe` | `dmg` | `AppImage` | `deb` | `zip`
- `-setup`：仅允许用于安装包（例如 Windows `setup.exe`），解析时不作为平台/架构判断依据

### 2.2 Renderer Override

命名格式：

```
tuff-renderer-{version}.zip
```

- 平台无关，必须通过 manifest 的 `coreRange` 指定兼容的 core 版本范围

### 2.3 Extensions Bundle

命名格式：

```
tuff-extensions-{version}.zip
```

- 平台无关，必须通过 manifest 的 `coreRange` 指定兼容的 core 版本范围

## 3. 校验与签名

- **sha256**：必须在 manifest 中提供（十六进制字符串，推荐小写）
- **签名**（可选）：
  - 资产签名文件命名：`{assetName}.sig` / `{assetName}.asc`
  - 公钥文件（可选）：`{assetName}.sig.key`
- 兼容策略：若 manifest 缺失，则仍允许使用旧的 `.sha256` sidecar 文件与 `.sig` 规则进行解析

## 4. Manifest 规范

Release 资产中必须包含 `tuff-release-manifest.json`，用于声明所有更新资产的校验与兼容信息。

### 4.1 字段定义

```json
{
  "schemaVersion": 1,
  "release": {
    "version": "2.4.7-beta.11",
    "channel": "BETA",
    "tag": "v2.4.7-beta.11"
  },
  "artifacts": [
    {
      "component": "core",
      "name": "tuff-core-2.4.7-beta.11-win32-x64-setup.exe",
      "platform": "win32",
      "arch": "x64",
      "sha256": "..."
    }
  ]
}
```

字段说明：

- `schemaVersion`：当前固定为 `1`
- `release.version`：版本号（与 tag 保持一致）
- `release.channel`：`RELEASE` | `BETA` | `SNAPSHOT`
- `release.tag`：Release tag（例如 `v2.4.7-beta.11`）
- `artifacts[]`：
  - `component`：`core` | `renderer` | `extensions`
  - `name`：资产文件名（与 Release 资产一致）
  - `platform` / `arch`：仅 core 资产必填
  - `sha256`：必填
  - `signature` / `signatureKey`：可选，指向签名/公钥文件名
  - `coreRange`：renderer/extensions 必填，用于声明兼容的 core 版本范围

## 5. 兼容策略

- **优先级**：存在 `tuff-release-manifest.json` 时优先使用 manifest 解析 sha256/签名
- **回退**：manifest 缺失时回退到文件名解析（平台/架构）与 `.sha256`/`.sig` sidecar 规则
- **渠道**：仍以 Release tag（`vX.Y.Z[-channel]`）解析渠道

## 6. 示例（含至少 2 平台）

Release 资产示例（节选）：

```
tuff-core-2.4.7-beta.11-win32-x64-setup.exe
tuff-core-2.4.7-beta.11-win32-x64-setup.exe.sig
tuff-core-2.4.7-beta.11-darwin-arm64.dmg
tuff-core-2.4.7-beta.11-darwin-arm64.dmg.sig
tuff-renderer-2.4.7-beta.11.zip
tuff-extensions-2.4.7-beta.11.zip
tuff-release-manifest.json
```

Manifest 示例：

```json
{
  "schemaVersion": 1,
  "release": {
    "version": "2.4.7-beta.11",
    "channel": "BETA",
    "tag": "v2.4.7-beta.11"
  },
  "artifacts": [
    {
      "component": "core",
      "name": "tuff-core-2.4.7-beta.11-win32-x64-setup.exe",
      "platform": "win32",
      "arch": "x64",
      "sha256": "WIN_SHA256",
      "signature": "tuff-core-2.4.7-beta.11-win32-x64-setup.exe.sig"
    },
    {
      "component": "core",
      "name": "tuff-core-2.4.7-beta.11-darwin-arm64.dmg",
      "platform": "darwin",
      "arch": "arm64",
      "sha256": "MAC_SHA256",
      "signature": "tuff-core-2.4.7-beta.11-darwin-arm64.dmg.sig"
    },
    {
      "component": "renderer",
      "name": "tuff-renderer-2.4.7-beta.11.zip",
      "sha256": "RENDERER_SHA256",
      "coreRange": ">=2.4.0"
    },
    {
      "component": "extensions",
      "name": "tuff-extensions-2.4.7-beta.11.zip",
      "sha256": "EXT_SHA256",
      "coreRange": ">=2.4.0"
    }
  ]
}
```
