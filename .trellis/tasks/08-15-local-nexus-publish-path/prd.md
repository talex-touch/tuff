# 本地 Nexus 上架链路打通

父任务：`08-15-local-store-three-plugins`。这是其余三个子任务的**前置**。

## Goal

在本地 Nexus（`http://localhost:3200`）上跑通一条可复现的插件上架链路：
构建 `.tpex` → CLI 登录 → 发布 → 管理员审核 → `/api/store/plugins` 能查到。

## Background

本地 `/api/store/plugins` 返回 `total: 0` 有两层原因（详见父任务 `design.md`）：

1. 当前 3200 上的 dev server 是裸 `nuxt dev` 起的，没有 `NUXT_USE_CLOUDFLARE_DEV=true`，
   因此没有 D1 绑定，所有插件读取回落到空的 unstorage。
2. 即使绑上 D1，库里那 3 行是 2026-07-19 签名审计门槛之前的遗留数据，
   缺 `publisher_signature` / `nexus_attestation` / `admission_status` 等字段，永远不可见。

所以必须验证的是**发布链路**本身，而不是数据。

## Requirements

1. 环境收敛：3200 只保留一个进程，且用 `pnpm nexus:dev` 启动。
2. 本地具备一个 `role === 'admin'` 的账号（当前三个用户都是 `user`），审核动作才可执行。
3. 用一个插件做探针，完整走一遍 build → login → publish(`--channel RELEASE`) → 审核 → 目录可见。
4. 链路中每一步的命令与预期输出写回父任务 `design.md`，第二个人能照着复现。
5. 不得通过直接 UPDATE D1 字段、或放宽 `getPluginVersionEligibility` 来制造「看起来通了」。

## Acceptance Criteria

- [ ] `curl "http://localhost:3200/api/store/plugins?compact=1"` 返回的 `total >= 1`。
- [ ] 返回项的 `latestVersion.channel === 'RELEASE'`，且该版本是本次真实发布产生的（不是旧行）。
- [ ] D1 里该版本行的 `publisher_signature`、`publisher_verified_at`、`nexus_attestation`、
      `admission_status`、`policy_decision`、`security_scan_decision` 均为可上架取值，且由服务端写入。
- [ ] 完整步骤已写入父任务 `design.md` 第二节。
- [ ] 操作前已备份 `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`，且记录了 `auth_users.role` 的原值。

## Constraints

- 本地 D1 是用户真实的开发数据，任何写操作前必须先备份。
- 提权只改本地 D1 的 `auth_users.role`，不改鉴权代码。
- attestation 信任根若在本地不可用，停下来汇报，不要跳过该判定。

## Non-Goals

- 三个插件各自的功能修复（归各自子任务）。
- 生产环境的任何操作。
- 客户端市场 UI 改动。
