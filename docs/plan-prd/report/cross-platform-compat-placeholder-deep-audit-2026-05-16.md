# 跨平台兼容、占位实现与架构健壮性深度审计（2026-05-16）

> 关系：本文承接 `cross-platform-compat-placeholder-summary-2026-05-15.md`，基于当前 live tree 做增量复核；不替代 Windows/macOS/Linux 真机 evidence。

## 1. 总体结论

当前项目不是“到处是假实现”的状态。生产主路径仍未发现新的 P0 级固定假值成功、mock 成功支付、平台能力伪装全支持或可消费占位 payload。

真正的风险继续集中在证据、边界与架构韧性：

1. `2.4.10` release gate 仍由 Windows 真机 acceptance、性能 evidence、`windows:acceptance:verify` 与 Nexus Release Evidence 决定；macOS 静态扫描不能替代。
2. `2.4.11` 的首要债务不是再找泛化 placeholder，而是把 shell capability、动态执行、secret backend、raw console 与 SRP 大文件逐步治理到可审计、可降级、可回滚。
3. 旧 `docs:guard`、`compat:registry:guard`、legacy/size allowlist 仍只作为历史语境出现；当前 live SoT 是 `quality:pr`、`quality:release`、Windows acceptance verifier、最近路径测试与人工 evidence 清单。

## 2. 跨平台兼容现状

CoreApp 的平台兼容合同整体是清晰的。`apps/core-app/src/main/modules/platform/capability-adapter.ts` 已把核心能力归一到 `supported / best_effort / unsupported`，并为不可用能力返回 `issueCode / reason / limitations`。

当前平台能力语义：

| 能力 | macOS | Windows | Linux | 当前判断 |
| --- | --- | --- | --- | --- |
| Active app | Automation permission 下 best-effort | PowerShell / Win32 foreground window best-effort | 依赖 `xdotool`，缺失则 unsupported | 合同明确，不是假成功 |
| Selection capture | supported | simulated Ctrl+C best-effort | `xdotool` + clipboard timing best-effort/unsupported | 仍需真机补证 |
| Auto paste | keyboard automation best-effort | keyboard automation best-effort | `xdotool` 依赖 | 用户可见 reason 已具备 |
| Native share | supported | `MAIL_ONLY` unsupported | `MAIL_ONLY` unsupported | 未伪装系统分享 |
| Permission deep-link | supported | supported | desktop environment best-effort | Linux 限制需 smoke 记录 |
| Everything search | unsupported | backend ready 时 supported | unsupported | Windows-only 合同正确 |
| Tuff CLI | probe 成功 supported | probe 成功 supported | probe 成功 supported | CLI 缺失时明确 `CLI_NOT_FOUND` |

结论：跨平台“能力表达”已经进入可维护阶段；不足主要是 release-blocking 真机 evidence，而不是能力矩阵本身缺失。

## 3. 占位、假实现与不优雅代码

### 3.1 未发现新的 P0 fake-success

本轮扫描重点过滤了普通 UI placeholder、`.fake-background` 视觉 token、测试 fixture、demo/playground 和构建产物。剩余生产高信号项没有出现“固定成功返回”的新 P0。

已确认的非 P0 项：

- Nexus 旧 `/api/sync/*`、旧 intelligence lab、旧 auth sign-in-token 等迁移接口返回 `410` 与 replacement message，属于显式退休，不是占位成功。
- Provider/Scene adapter 缺失时返回 `501` / `provider_adapter_unavailable`，属于明确不可用，不是伪成功。
- `packages/tuff-native/native/src/platform/stub/ocr_stub.cpp` 是构建层 unsupported stub，不应和生产 OCR fake-success 混为一类。

### 3.2 P1 高信号治理点

1. 插件 shell capability：`plugins/touch-workspace-scripts/index.js` 仍用 `spawn(command, { shell: true })` 运行用户配置命令。它已有确认弹窗、unsafe pattern 拦截和 item capability metadata，但还没有统一 platform/permission/audit capability 模型。建议作为下一轮 P1 首切。
2. 动态执行边界：`apps/core-app/src/main/modules/box-tool/addon/preview/abilities/basic-expression-ability.ts` 和 `apps/core-app/src/main/modules/calculation/unit-converter.ts` 使用 `new Function` 做算式/公式执行；前者有正则约束，后者公式来自仓内 JSON。`apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts` 也用 `new Function` 执行 widget runtime code，并通过 sandbox facade 注入受控 globals。这些不是 fake，但需要统一纳入动态执行策略、审计与回归。
3. Secret backend：CoreApp `secure-store` 目前是本地 AES-GCM envelope + `local-secret` backend，health 标记 degraded；CLI token 走 `CliCredentialStore`，POSIX `0700/0600` 是过渡缓解，Windows 只做 user-profile/ACL warning。后续仍需要 Keychain / Credential Locker / libsecret 或等价系统 backend。
4. Runtime console：preload debug log 已由 debug mode 门控；但 renderer、Nexus、插件与 `search-logger` 仍存在较多裸 `console.*`。这不是 release blocker，但会削弱结构化诊断、一致脱敏和生产日志治理。

## 4. 架构健壮性与 SRP 风险

过滤 `out/`、`.wrangler/`、`dist/` 后，当前最大文件仍集中在跨域 orchestration 和 UI 管理页：

| 文件 | 行数 | 风险 |
| --- | ---: | --- |
| `apps/nexus/server/utils/tuffIntelligenceLabService.ts` | 4021 | provider routing、usage ledger、tool execution、serialization 混合 |
| `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` | 3821 | scanner、index runtime、watcher、thumbnail、diagnostics 混合 |
| `apps/core-app/src/main/modules/plugin/plugin-module.ts` | 3810 | lifecycle、runtime repair、surface wiring、registry sync 混合 |
| `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts` | 3384 | source scanner、launch resolver、metadata、diagnostics 混合 |
| `apps/nexus/app/pages/dashboard/admin/intelligence.vue` | 3000 | provider/scene/model 管理状态与交互混合 |
| `apps/nexus/app/pages/docs/[...slug].vue` | 2850 | fetch state、TOC、assistant、render helper 混合 |
| `packages/utils/transport/events/index.ts` | 2743 | transport event registry 聚合过大 |

建议继续小切片拆分：只移动纯 helper、mapper、store adapter、runtime adapter，不在同批改变业务语义。这样符合 KISS/YAGNI，也能避免把兼容治理变成不可验证的大重构。

## 5. 文档与计划口径

活跃入口目前基本一致：

- 当前基线仍是 `2.4.10-beta.25`。
- `2.4.10` 不扩大功能范围，继续以 Windows evidence 与 Nexus Release Evidence 为 gate。
- `2.4.11` 优先收口 shell capability、dynamic execution、secret backend、runtime console 与 SRP 小切片。
- 旧 guard/registry/allowlist 不再作为 live SoT；若要恢复自动治理，应重新立项，不应继续引用不存在的脚本或清册。

## 6. 建议下一步

1. 先完成 `P0-WIN-*`：Windows acceptance collection plan、case/manual/performance evidence、`windows:acceptance:verify` 与 Nexus Release Evidence。
2. 进入 `P1-SHELL-CAP` 首切：以 `touch-workspace-scripts` 为样本，把用户 shell 命令纳入统一 capability/audit/unsupported reason 模型，并补最小测试。
3. 建立动态执行治理清单：算式 evaluator 先替换为小型 parser 或 AST evaluator；widget runtime 保留 sandbox，但补 allowed globals、audit、failure reason 与 regression。
4. 推进 secure-store OS backend：CoreApp 与 CLI 分别给出 Keychain / Credential Locker / libsecret 的 degraded health 与迁移策略。
5. SRP Wave C 继续小步拆分：优先 `file-provider` 或 `plugin-module` 的纯 helper/service，不与行为变更混批。

## 7. 本轮验证与限制

已执行：

- 读取 2026-05-15 总结、活跃 TODO/README/Roadmap/Quality Baseline/INDEX。
- 静态扫描平台分支、`placeholder/fake/mock/stub`、`new Function`、`shell: true`、secret/token storage、retired endpoint、raw console 与大文件。
- 过滤构建产物后重新统计生产源文件行数。
- 对 `plugins/touch-workspace-scripts/index.js` 执行 `node --check`，确认语法有效。

未执行：

- 未运行完整 `pnpm quality:release`。
- 未执行 Windows/macOS/Linux 真机验证。
- 未写入 Nexus Release Evidence。
- 未执行 git commit / push。
