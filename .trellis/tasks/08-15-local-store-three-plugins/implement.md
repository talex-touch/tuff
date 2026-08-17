# 执行计划：三插件本地市场端到端打通

四个子任务串行，`08-15-local-nexus-publish-path` 是其余三个的前置。前置没通过之前不要开始插件侧的发布工作，
否则会拿插件的问题去解释链路的问题。

## 阶段 0：环境确认（已完成）

- [x] 备份活的 D1 至 `~/Backups/tuff-d1-20260815/`（仓库外，22MB sqlite 不进 git）
- [x] 确认 dev server 由 `pnpm -F @talex-touch/tuff-nexus run dev` 拉起，`NUXT_USE_CLOUDFLARE_DEV=true`，D1 绑定正常
- [x] 确认活的 miniflare 状态目录是**仓库根** `.wrangler/state/v3`，不是 `apps/nexus/.wrangler`（见 design.md §0）
- [x] 确认活库 `dashboard_plugins` 为 0 行、schema 已最新、3 个用户全是 admin
- [x] 3200 上第二个进程（99415）已自行退出，现只剩 96386

> 结论：不需要提权、不需要迁移旧数据。空市场是如实反映，只能靠真发布来填。

## 阶段 1：打通上架链路（子任务 `local-nexus-publish-path`）

### 1a. 补齐本地 attestation 密钥（已完成）

- [x] 生成 ed25519 密钥对（私钥 PEM + 公钥 PEM）
- [x] `apps/nexus/.env.local`（已在 gitignore 内）增加 `PLUGIN_ATTESTATION_PRIVATE_KEY_PEM` 与
      `PLUGIN_ATTESTATION_KEY_ID=local-dev-attest-2026`（匹配 `pluginSigning.ts:34` 的 `KEY_ID_RE`）
- [x] 3200 收敛为单进程（pid 87549，`NUXT_USE_CLOUDFLARE_DEV=true`），`/api/store/plugins` 返回 `total:0`
- [x] 实际触发 attestation 签发，确认不再抛 `PLUGIN_ATTESTATION_KEY_UNAVAILABLE`
- [x] 核心应用通过 `TUFF_PLUGIN_TRUST_ROOTS_JSON` 追加对应公钥；内置根未被替换

### 1b. 发布者签名密钥

- [x] 走 `/api/dashboard/plugin-signing-keys` / 发布校验注册发布者签名密钥
- [x] `getPublisherSigningKey` 可查到当前 active key，不再 `PLUGIN_SIGNING_KEY_UNKNOWN`

### 1c. 探针发布

- [x] `clipboard-history` 最终构建产出 `dist/clipboard-history-1.1.11.tpex`（约 0.26 MB）
- [x] 用 `clipboard-history` 做探针：login → `publish --channel RELEASE` → 审核 → 目录可见

> 环境坑：macOS 没有 `timeout` 命令，套在构建命令外会触发 mise 的 `command_not_found_handler` bug，
> 报错 `_mise_cnf_tried: assignment to invalid subscript range` 并吞掉真实输出。别用 `timeout`。
- [x] 安全扫描在本地得到 `passed`；受审 waiver 仅用于精确 artifact digest
- [x] 完整步骤与验证结果已写回 design.md「执行结果」

**验收**：`/api/store/plugins?compact=1` 的 `total >= 1`，返回项 `latestVersion.channel === 'RELEASE'`，
且 D1 中该行的 `publisher_verified_at` / `nexus_attestation` / `admission_status` 均为可上架取值。

> 回滚点：链路走不通 → 停在这里汇报，不要退化成方案 B 悄悄改数据。
> 密钥只写进 `.env.local`（已在 gitignore 内），不进仓库、不进报告。

## 阶段 2：三个插件并行推进

三个子任务互不依赖，但都依赖阶段 1。每个的收敛标准写在各自 prd.md。

### 2a-0. 构建期 waiver 能力（通用，已完成 2026-08-15）

- [x] `tuff builder` / `tuff scan` 支持 `--waivers`，缺省读插件根的 `security-waivers.json`
- [x] waiver 可按 `fileSha256` 作用域（`artifactSha256` 每次重建都变，绑它等于永远不匹配）
- [x] 无作用域的 waiver 匹配不到任何东西；`critical` 永不可豁免；被豁免项每次构建都打印
- [x] `packages/utils` 扫描器 25/25、`tuff-cli-core` 65/65、lint 干净
- [ ] **未做**：`.tpex` 可复现构建（`compress-util.ts` 把 mtime 写进 tar 头），单独立项

### 2a. `json-formatter-onboarding`（工作量最大，先开）
- [x] `json-formatter` 已进入 `plugins/json-formatter`，独立仓库残留已去除
- [x] `package.json` 使用 `@talex-touch/json-formatter-plugin`，无本机绝对路径
- [x] manifest 权限、reason、SDK 260713、关闭开发地址与 CoreBox 交互已适配
- [x] `pnpm -C plugins/json-formatter run lint` + `typecheck` + `build`
- [x] `pnpm plugins:validate`
- [x] 本地发布并升级到 `1.0.8`

### 2b. `clipboard-history-local-verify`
- [x] 构建 + 发布 + 审核 + 市场安装
- [x] 功能验证：记录历史、回写剪贴板、权限拒绝明确反馈

### 2c. `touch-translation-local-verify`
- [x] 构建 + 发布 + 审核 + 市场安装
- [x] 功能验证：MyMemory 完成真实文本翻译
- [x] 安全验证：测试密钥进 secret 通道，普通 plugin storage 与隔离 profile 搜不到明文

## 阶段 3：整体收敛（父任务）

- [x] `GET localhost:3200/api/store/plugins?compact=1` → `total === 3`
- [x] 核心应用切到 local 运行时，市场页逐个搜索名称与中英文关键词
- [x] 三个插件依次安装、启用、跑主功能
- [x] scoped lint、typecheck、focused tests、插件 build 与 package policy 全部通过
- [x] 汇总写入 design.md，并将四个 PRD 验收项同步为完成

## 验证命令清单

```bash
# 本地目录
curl -sS "http://localhost:3200/api/store/plugins?compact=1" | jq '{total, ids: [.plugins[].slug]}'

# 单插件可见性
curl -sS -o /dev/null -w "%{http_code}\n" "http://localhost:3200/api/store/plugins/<slug>"

# D1 直查（只读）
sqlite3 apps/nexus/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/2b71008d*.sqlite \
  "SELECT p.slug, v.version, v.channel, v.status, v.admission_status, v.nexus_attestation
   FROM dashboard_plugins p JOIN dashboard_plugin_versions v ON v.plugin_id = p.id;"

# 插件侧
pnpm -C plugins/<plugin> run lint
pnpm -C plugins/<plugin> run build
pnpm plugins:validate

# 核心应用（只在改了 core-app 时才需要）
pnpm -C apps/core-app run typecheck
```

## 审查门

- 阶段 1 结束后必须停下来汇报一次：链路是否真的通了，通的代价是什么。
- 任何一次「为了让它显示出来」而绕过 eligibility 判定的动作，必须显式提出并等确认，不得自行决定。
- 三个插件全部完成后，再统一提交；不要边做边 commit 造成中间态难以回滚。
