# 实施计划

## 1. 当前批次基线

- 运行 `quality:pr`，定位真实失败与未归属临时产物污染。
- 显式执行 Utils build、Core node/web typecheck、Nexus/插件聚焦测试和 plugin manifest validation。
- 将假绿、skip、路径遗漏和生成目录污染修到可重复通过。

## 2. Workflow 门禁

- 审计所有 package CI/publish workflow 的 paths、filter、脚本和依赖。
- 为 release 增加同 SHA quality job，并让 platform build/create-release 形成硬依赖。
- 增加 workflow 静态/行为测试，验证 gate failure、复用 artifact 和触发模式均不可绕过。
- 校验并配置 master required checks，只选择无路径过滤且已在远端实际出现的稳定 context。

## 3. 发布资产验收

- 对当前 tag 执行 GitHub/Nexus/latest/manifest/rollback/signature/trust-root 远端门禁。
- 通过 Nexus 用户下载路径获取 host asset，核对 SHA-256、架构、签名、公证和 packaged runtime。

## 4. OTA 真机

- macOS 隔离安装 N，发现并准备 N+1；记录 ready/click/quit/helper/replace/startup/health ack。
- 验证无提权、失败恢复、previous rotation 和一次性 token/plan replay 防护。
- 在 Windows/Linux workflow 或真实宿主执行对应 N/N-1 acceptance，并读取日志确认测试实际运行。

## 5. 收尾

- 运行 actionlint、release acceptance tests、quality gate、build preflight 和文档检查。
- 更新 README/ROADMAP/CHANGES/release notes 与任务证据；未运行的平台不得标记完成。
