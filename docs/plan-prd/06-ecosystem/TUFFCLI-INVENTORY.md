# Tuff CLI 范围与清单（Scope + Inventory）

> 更新时间: 2026-03-16
> 依据: `packages/tuff-cli/bin/tuff.js`（主入口）+ `packages/unplugin-export-plugin/dist/bin/tuff.js`（兼容 shim）
> 状态: 真实口径（`tuff-cli` 主入口，`unplugin` 兼容层）

## 1. 入口与兼容窗口

- 主入口：`@talex-touch/tuff-cli` 提供 `tuff` 命令。
- 兼容入口：`@talex-touch/unplugin-export-plugin` CLI 已降级为 shim（deprecation + 转发）。
- 生命周期策略：
  - `2.4.x`：保留 shim。
  - `2.5.0`：移除 shim，仅保留构建插件能力。

## 2. 全局参数

- `--lang=en|zh`：设置 CLI 语言。
- `--local`：使用本地 Nexus 地址（默认 `http://localhost:3200`）。
- `--api-base`：覆盖 Nexus API Base URL。
- `--config-dir`：覆盖 CLI 配置目录（默认 `~/.tuff`）。
- `--non-interactive`：关闭交互提示。

## 3. 命令清单（当前实际）

- `create`：创建插件模板。
- `build`：执行构建并打包 `.tpex`。
- `builder`：仅打包已有产物为 `.tpex`。
- `dev`：启动插件开发服务器。
- `publish`：发布插件到 Tuff Nexus。
- `validate`：校验 `manifest.json` 与权限声明。
- `login`：登录并保存凭据。
- `logout`：清理本地凭据。
- `help`：帮助信息。
- `about`：工具信息。

> 交互模式：无参数执行 `tuff` 进入交互菜单。

## 4. 验证口径（最小烟雾）

- `node packages/tuff-cli/bin/tuff.js --help`
- `node packages/tuff-cli/bin/tuff.js validate --help`
- `node packages/tuff-cli/bin/tuff.js validate --manifest <invalid> --strict`（预期非 0）
- `node packages/unplugin-export-plugin/dist/bin/tuff.js --help`（预期出现 deprecation 并转发）

## 5. 与历史文档关系

- 本文档已替代旧“unplugin 直承 CLI 逻辑”的描述口径。
- 若命令面或参数变更，必须同步：
  - `docs/plan-prd/06-ecosystem/TUFFCLI-PRD.md`
  - `docs/plan-prd/06-ecosystem/TUFFCLI-SPLIT-PLAN.md`
  - `docs/plan-prd/01-project/CHANGES.md`
