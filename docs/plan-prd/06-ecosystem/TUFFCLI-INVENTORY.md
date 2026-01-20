# Tuff CLI 范围与清单（Scope + Inventory）

> 更新时间: 2026-01-20
> 依据: `packages/unplugin-export-plugin/src/bin/tuff.ts`
> 说明: 单一来源记录命令范围、成功标准与当前实现行为

## 全局入口与参数

- 入口: `tuff <command> [options]`
- 全局参数:
  - `--lang=en|zh` 切换 CLI 语言（仅影响当前进程）
- 全局帮助:
  - `tuff help` 输出总览
  - `tuff <command> --help` / `-h` 输出命令帮助

## 当前命令与行为

### `tuff create [name]`

- 入口: `tuff create` 或 `tuff create <name>`
- 交互流程:
  - 插件类型（basic/ui/service）
  - 语言（TypeScript/JavaScript）
  - UI 框架（Vue/React/None，UI 类型时出现）
  - 模板（default/translation/image/custom）
  - 输出目录（默认 `.`）
- 前置依赖: 本机需安装 Git；模板仓库拉取后会删除 `.git`
- 产出: 在目标目录生成插件模板；可选择安装依赖
- 输入: `name`（可选）+ 交互选择 + 输出目录
- 成功: 目录创建完成，模板拉取成功，manifest 写入成功；若选择安装依赖则安装完成
- 失败: Git 未安装、目标目录已存在、模板拉取失败、依赖安装失败

### `tuff build`

- 参数:
  - `--watch` 监听文件变化并重复打包
  - `--dev` 开发模式（minify=false, sourcemap=true）
  - `--output <dir>` 输出目录（默认 `dist`）
- 行为:
  - 执行 Vite build + `TouchPluginExport`
  - 触发打包器生成 `.tpex`（`dist/build/*.tpex`）
  - `--watch` 时在 Vite `END` 事件后重新打包
- 输入: CLI 参数 + `manifest.json` + Vite 配置
- 输出: `dist/out` 备份 + `dist/build/*.tpex`
- 成功: Vite build 完成且 `.tpex` 生成
- 失败: 参数错误、Vite build 报错、打包失败

### `tuff builder`

- 参数: 无
- 行为: 仅运行打包器（`build()`），不触发 Vite build
- 输入: 项目目录 + `manifest.json`
- 输出: `dist/build/*.tpex`
- 成功: `.tpex` 生成
- 失败: manifest 缺失或打包失败

### `tuff dev`

- 参数:
  - `--port <port>` 指定端口
  - `--host [host]` 指定主机；省略值则监听所有地址
  - `--open` 启动后打开浏览器
- 行为:
  - 启动 Vite dev server
  - 使用 `TouchPluginExport` 进行插件预览/热更新
- 输入: CLI 参数 + 项目目录
- 输出: dev server 运行并打印访问地址
- 成功: server.listen 成功且无启动错误
- 失败: 端口无效或 dev server 启动失败

### `tuff publish`

- 参数:
  - `--tag <tag>` 发布标签（默认读取 `package.json` 版本）
  - `--channel <RELEASE|BETA|SNAPSHOT>` 发布通道
  - `--notes <text>` 变更说明（Markdown）
  - `--dry-run` 预览模式
  - `--api-url <url>` 指定发布 API
- 行为:
  - 读取 `~/.tuff/auth.json` 或 `TUFF_AUTH_TOKEN`
  - 校验 `manifest.json` 与 `package.json` 版本一致
  - 扫描 `dist/build` 与 `dist` 中的 `.tpex`
  - 上传最新 `.tpex` 到发布 API
- 输入: token + `manifest.json` + `package.json` + `.tpex` + CLI 参数
- 输出: 发布 API 响应
- 成功: API 返回 ok 且输出成功提示
- 失败: 未登录、版本不一致、无 `.tpex`、网络/接口错误

### `tuff login <token>`

- 行为: 保存 token 至 `~/.tuff/auth.json`
- 输入: token
- 输出: `~/.tuff/auth.json`
- 成功: token 写入成功
- 失败: 未提供 token（显示用法提示）

### `tuff logout`

- 行为: 删除 `~/.tuff/auth.json`
- 输入: 无
- 输出: 认证文件删除或提示无会话
- 成功: 文件删除或输出无会话提示
- 失败: 文件权限错误（如发生）

### `tuff help`

- 行为: 输出命令总览
- 输入: 无
- 输出: 帮助文本
- 成功: 帮助文本输出

### `tuff about`

- 行为: 输出版本与工具信息
- 输入: 无
- 输出: 版本与工具信息
- 成功: 信息输出

### `tuff`（无参数）

- 行为: 进入交互式菜单（create/build/dev/publish/login/logout/settings/help）
- 输入: 交互选择
- 输出: 执行对应命令或退出
- 成功: 菜单可用且执行成功路径
- 失败: 交互异常或命令执行失败

## 与 PRD 的差异（Gap 列表）

- `tuff build` 未提供 `--prod` 显式参数（当前默认生产模式）
- `tuff publish` 未提供 `--registry`（PRD 预期 nexus/npm/github 选择）
- `tuff publish` 不会自动触发构建，依赖已有 `.tpex` 输出
- 额外命令（PRD 未列出）：`builder`、`login`、`logout`、`about`、`help`
- `tuff create` 仅支持交互式参数（缺少对应的非交互参数映射）
- `tuff dev` 未提供显式“连接 Tuff App 预览”的开关（当前仅启动 Vite dev server）
