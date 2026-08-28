# 技术设计

## 1. 矩阵事实源

官网功能矩阵由五类事实源合成，不引入新的业务事实源：

| Source | Owner | Purpose |
| --- | --- | --- |
| `apps/nexus/app/data/tuffSdkItems.ts` | Nexus docs | 公开 SDK/能力卡片入口。 |
| `apps/nexus/content/docs/**` | Nexus docs | 中英文开发者 API、插件文档和用户功能文档。 |
| `plugins/*/manifest.json` | Official plugins | runtime id、feature、permission、SDK marker、平台声明。 |
| `packages/utils/plugin/sdk-version.ts` | Plugin SDK | 当前 marker、兼容 allowlist 和权限强制语义。 |
| package/workflow tests | CI owners | build/typecheck/test/publish 证据。 |

矩阵输出只保存稳定路径、id、版本、状态和命令；不保存运行日志、真实用户数据或凭据。

## 2. 状态模型

每个能力/插件使用同一状态词：

- `pass`：代码、文档、自动化和对应运行环境证据均存在。
- `partial`：代码或文档存在，但缺一类关键证据。
- `blocked`：必须依赖当前环境没有的真机、runner、生产部署或显式 opt-in。
- `unavailable`：公开承诺尚未实现或被设计禁止。

官网 UI 只能把 `pass` 和明确可用的 `partial` 展示为可尝试能力；`blocked/unavailable` 必须以受限状态或 backlog 形式呈现。

## 3. 插件 SDK 迁移边界

插件 SDK marker 升级遵循“用到新能力才升级”：

```text
manifest feature/permission
  -> SDK facade used by Prelude/Surface
  -> runtime permission gate
  -> manifest sdkapi marker
  -> docs/README examples
  -> focused plugin test + plugins:validate
```

- `260713` 适用于 localization/Intelligence 基线等已迁移 facade。
- `260817` 适用于 `system.resolveApplication()` 等 application-resolution 能力。
- 未使用新 API 的插件保持旧 marker，矩阵标为 `supported/legacy baseline`，不批量改值。

## 4. 官网功能映射

公开文档中的功能入口必须映射到一个 owner：

- CoreApp 功能：主进程/renderer 模块、typed transport、privacy owner 或 package test。
- Nexus 功能：server route/store/component、Cloudflare/D1/R2 证据边界。
- Plugin 功能：manifest feature id、Prelude/Surface、permission reason 和插件测试。
- SDK 功能：`packages/utils/plugin/sdk/**`、dev API docs、example/snippet 和 compatibility test。

找不到 owner 的官网声明标为 `unavailable` 或删除/降级文案；不新增假实现。

## 5. 上游 SDK modernization

- Patch/minor 升级先运行 `pnpm outdated -r`，只选择不改变公开 API 且测试覆盖充分的包。
- LangChain.js v1 属破坏性迁移，需要独立设计：import path、Agent API、stream usage/audit、fallback、quota 和 docs examples 一起迁移。
- Electron Builder 版本和自动更新目标由 release/OTA 子任务验证，当前矩阵只引用其官方目标/签名约束。
- MCP SDK 保持 live smoke opt-in；未显式启用时只记录 static/API compatibility，不计完成。

## 6. 自动化守卫

短期沿用现有 `plugins:validate`、`manifest-boundary.test.ts` 和 package workflow tests。下一步可新增一个矩阵生成/校验脚本，要求：

- docs 目录和 manifest 列表能互相对账；
- `tuffSdkItems` 每项能绑定 SDK path 或 dev API doc；
- 每个插件生成 `manifest/package/docs/sdkapi/smoke/status` 投影；
- 对 `blocked/unavailable` 使用显式 allowlist，避免沉默漂移。

## 7. 风险与回滚

- 文档/矩阵先行，不改变运行时。
- 单插件迁移单插件验证；失败只回退该插件的 marker/docs/code，不影响其它插件。
- 上游 SDK 迁移独立分批，失败时恢复 lockfile 和导入路径即可回到当前兼容线。
