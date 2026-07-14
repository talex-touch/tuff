# plugins/AGENTS.md

适用于 `plugins/**`。根规则仍然生效；本文只补官方/示例插件约束。

## 插件结构

- 插件三层：Manifest（`manifest.json`）、Prelude（`index.js` 或构建产物）、Surface（按需 UI）。
- 新插件优先使用当前 DevKit / SDK 推荐结构；不要新增 ad-hoc runtime bridge。
- 示例插件也必须保持真实用途说明，不保留 Vite starter 文案、favicon、无关 asset 或模板 README。

## npm 包名

- 包含 `package.json` 的插件必须使用 `@talex-touch/<runtime-plugin-id>-plugin`；`runtime-plugin-id` 始终等于插件目录名，不能借此重命名目录或 manifest runtime ID。
- 仅含 `manifest.json` 的运行时插件是有意不发布 npm 包的 manifest-only 插件，不应补充占位 `package.json`。

## Manifest / SDK

- `sdkapi` 当前值和支持列表以 `packages/utils/plugin/sdk-version.ts` 为准，不在 AGENTS 写死。
- manifest 权限必须写明 reason；高风险能力（shell/network/fs/clipboard/window/AI）必须通过 permission gate。
- `manifest.searchProviders`、`manifest.indexedSources` 只声明能力/metadata，不等于绕过用户同意直接注册 runtime source。
- root results push 必须受 `search.root-results` 权限和 provider enabled 状态约束。

## Permission / Trust Boundary

- 执行期必须 request/block；展示期只允许 non-mutating permission check。
- permission SDK 缺失或异常时 fail-closed，不得继续执行 shell/network/fs/clipboard mutation。
- 返回结果保留具体 reason：`permission-denied`、`permission-sdk-unavailable`、`permission-request-failed` 等。
- 不使用宿主 `copy` action 绕过插件 `clipboard.write` gate；复制类动作必须回到插件 action 或 SDK gate。

## Secret / Storage

- provider secret、API key、token 必须走 plugin secret capability / secure-store facade。
- 普通 plugin storage 只保存 sanitized metadata，不保存明文 secret。
- secret 写入失败必须 fail-closed；不得先更新普通配置再丢失 secret。
- JSON 只作为插件本地配置或同步载荷时必须遵守根 Storage/Sync 规则；不得把业务明文 dump 成同步 SoT。

## TuffEx / UI

- 插件 UI 优先使用 TuffEx；样式优先 `@talex-touch/tuffex/base.css` + 组件子路径样式。
- 不要默认引入全量 `@talex-touch/tuffex/style.css`，除非明确标记为 legacy full-style 兼容示例。
- Surface UI 必须考虑 keyboard/focus、暗色主题与 degraded state。

## Indexed Source / App Data

- 浏览器书签/历史、文件、Obsidian、VSCode 等 high privacy 数据源默认 disabled/ask。
- 必须提供 enable/disable/clear/rebuild 与用户可见 degraded/unsupported reason。
- 不读取未授权路径，不把 root path、history URL、secret payload 写入日志或 evidence。

## 推荐验证

- 插件 lint/build：`pnpm -C "plugins/<plugin>" run lint`、`pnpm -C "plugins/<plugin>" run build`（若脚本存在）。
- Manifest 校验：`pnpm plugins:validate`
- 最近路径测试：优先运行插件自身 focused tests 或 package-level official plugin tests。
- 文档/空白：`git diff --check`
