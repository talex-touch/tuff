# 实施计划：经典辅助与 AI 插件套件

## 顺序

1. 固化 `prd.md`、`design.md` 与 capability/DTO 合同；确认不触碰现有系统动作的重复实现。
2. 在主进程新增四个独立 capability 定义及其严格 normalizer、权限/activation 校验、撤销和 teardown；先写 capability 单元/边界测试。
3. 将能力接入 runtime capability registry、child facade 与插件 activation allowlist；补 host-only/forged identity 回归。
4. 并行实现四个插件的 manifest、Prelude、package/test（每个 agent 只拥有自己的 `plugins/<name>/` 与对应插件测试文件；共享宿主文件由集成 owner 修改）。
5. 为现有 `touch-system-actions`、`touch-quick-actions`、`touch-quickops` 运行/补齐 focused 行为验证，不做同义插件。
6. 逐项运行插件本地 test/build/lint（脚本存在时）、`pnpm plugins:validate` 与宿主 focused tests；失败先按 capability/插件边界归因。
7. 进行隔离宿主 smoke：安装/启用、权限拒绝、正常只读路径、确认拒绝/接受、revoke/destroy 清理；不把 fixture/local 结果写成生产证据。
8. 做最终跨层检查：manifest id/feature/provider/permission 对齐，DTO 无原始路径/秘密，所有新增能力均有取消/超时/资源清理，`git diff --check` 通过。
9. 将旧 `touch-image` 切换为隔离 Prelude，接入 `media.image-tools` token vault、Sharp bounded renderer、原生保存对话框与原子写入；补 capability/Prelude/宿主 smoke 和真实格式签名验证。

## 建议的文件所有权

- Hosts：`plugins/touch-hosts/**`；宿主 capability 文件由集成 owner 统一维护。
- VS Code：`plugins/touch-vscode-projects/**`。
- Orca：`plugins/touch-orca/**`。
- AI Sessions：`plugins/touch-ai-sessions/**`。
- 既有系统插件：只改其自身测试/Prelude，除非出现明确回归。
- 共享文件（`plugin-host-wire.ts`、`plugin-host-child-runtime.ts`、`plugin.ts`、`plugin-module.ts`、权限/transport 类型）禁止并行 agent 直接改；由一个集成 owner 按合同串行合入。

## 验证命令

```bash
pnpm plugins:validate
pnpm -C plugins/touch-hosts test
pnpm -C plugins/touch-vscode-projects test
pnpm -C plugins/touch-orca test
pnpm -C plugins/touch-ai-sessions test
pnpm -C apps/core-app run typecheck:node
pnpm -C apps/core-app run typecheck:web
pnpm -C apps/core-app exec vitest run <changed-host-tests>
git diff --check
```

每个插件先用自身存在的脚本；manifest-only 插件使用根插件测试 harness，不擅自补空脚本。构建前先跑 manifest 验证，避免把无效权限或错误 feature platform 带入集成。

## 风险与回滚点

- 若宿主 capability 接入使 runtime 类型或现有插件加载失败，先撤回新增 capability 注入，不改既有 capability 行为。
- 若 Hosts 原子写入任一稳定身份/备份检查失败，停止 mutation 并保留原文件。
- 若 VS Code storage 格式未知或路径被替换，返回 degraded，不猜测路径。
- 若 Orca CLI 不存在或输出 schema 不匹配，返回 unsupported，不执行 fallback shell。
- 若 AI session 根目录不可访问，返回可见 degraded；若目录/来源/合并结果触顶，保留安全子集并设置 `incomplete=true` / `scan-limited`，不把失败内容或 transcript 落盘。
- 若图片输入超限、为多页/动画/SVG/PDF、源文件 identity 漂移或保存目标无法原子替换，返回稳定 blocked/failed reason；绝不回退到 child 原始路径或不受控 Electron API。

## 验证记录（2026-09-02）

- 五项插件交付均完成 builder；bundled source/build 与源插件逐字节一致；`pnpm plugins:validate` 完成 29/29 manifest/package 校验。
- 原四插件的 7 个相关 Prelude 共 73 tests、CoreApp 17 个聚焦测试文件共 480 tests，以及 plugin/manifest 65 tests、business/child runtime 94 tests、reserved install/seed 15 tests、release catalog 24 tests 均通过。
- CoreApp Node/Web typecheck、Electron Vite production build、canonical sensitive-data inventory verifier（14 entries / 48 evidence）与 `git diff --check` 通过。
- 实际只读探针：Orca 四条固定 CLI 成功；VS Code 索引 `ready/1` 且不回传路径；Hosts preview `ready` 且不回传路径；AI reader 发现 216 条元数据且未回传路径、transcript 或秘密。
- 独立 Electron `smoke:plugin-host-isolation` 通过；覆盖动态权限、撤权、跨 activation 隔离、plugin disable/destroy 清理，以及当前 touch-translation widget 和 touch-quick-actions publish-then-run 合同。
- 所有证据仅代表本地/fixture 验收。`design.md` §9 的 Windows Hosts 提权取消与 VS Code 外部打开前 TOCTOU 两项 medium 风险仍然存在。
- `touch-image` Prelude 6 tests；最终 CoreApp 图片/插件/剪贴板 7 文件 136 tests；scoped ESLint 与 Node typecheck 通过。
- 真实 Sharp 测试覆盖 PNG/WebP/JPEG/ICO magic、精确画布、JPEG 白底、ICO directory、动画/矢量/超限；独立 Worker smoke 输出 `IMAGE_TOOLS_WORKER_SMOKE_OK`，取消会 terminate Worker。
- `touch-image` 本地源包审计通过：artifact SHA-256 `73ee3c17a7adf88be8d74f9a32ab0c5611c6194e16e135cabf818672e73be94b`，安全扫描 0 findings，bundled projection matched。
- 上游剪贴板原图改为 no-follow、32 MiB 预检、分块读取和 identity 复核；超限 sparse fixture 保留 preview，不再无界 `readFile → base64`。
- 图片功能同样只代表本地/fixture 验收；用户选择的目标 pathname 仍采用同账户 last-writer-wins，失败的操作系统 unlink 可能留下随机 0600 stage 文件，不写成绝对安全承诺。
