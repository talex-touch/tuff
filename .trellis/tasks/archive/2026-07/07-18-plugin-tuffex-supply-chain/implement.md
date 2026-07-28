# 插件发布与 TuffEx 供应链 - Implementation Plan

## Execution Strategy

父任务不直接承载功能代码。按依赖顺序启动和关闭八个子任务；每个子任务独立实现、验证、提交和归档，父任务最后执行跨子任务集成验收。

## Ordered Checklist

1. [x] 完成 `07-18-plugin-package-policy`，冻结 policy contract/version/violation codes。
2. [x] 完成 `07-18-plugin-security-scan`，让报告绑定 policy-normalized artifact digest。
3. [x] 完成 `07-18-plugin-signing-trust-chain`，冻结 signing payload、key id 和 attestation contract。
4. [x] 完成 `07-18-plugin-source-package-audit`，从 canonical source 生成 audited artifact。
5. [x] 完成 `07-18-nexus-plugin-display-gate`，统一所有公开 Store/download 入口。
6. [ ] 完成 `07-18-real-tpex-upload-acceptance`，采集 deployed D1/R2 + CoreApp install 闭环。
7. [ ] 完成 `07-18-plugin-release-evidence`，用 strict verifier 绑定完整链路。
8. [ ] 完成 `07-18-plugin-cli-shim-retirement`，删除 bypass canonical CLI 的兼容面。
9. [ ] 运行父任务 integration review：八个子任务记录必须引用同一 artifact digest 与 compatible contract versions。
10. [ ] 更新对应可执行 spec；只有 strict real-upload evidence 通过后才关闭父任务。

## Cross-Task Review Gates

- Policy code/version 变更后，scan/signing/Nexus/evidence 子任务必须重新确认兼容。
- Nexus schema/eligibility 变更后，真实上传和证据 schema 必须同步。
- CLI shim 不得在 canonical CLI 尚未承载 policy/scan/signing 前退场。
- 任何 child 只能按自身 evidence level 报告完成，不能借用另一个 child 的 mock/focused 结果。

## Final Verification

```bash
python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-18-plugin-tuffex-supply-chain
python3 ./.trellis/scripts/task.py list
# Child implement.md 中的 focused/typecheck/build/smoke 命令全部通过
# Release evidence strict verifier exits 0 against a real-upload manifest
```

## Risky Boundaries

- Shared plugin contracts in `packages/utils/plugin/`.
- Canonical CLI ownership across `tuff-cli-core`, `tuff-cli`, and `unplugin-export-plugin`.
- Nexus D1/R2 version/admission state and all public Store endpoints.
- CoreApp pre-extraction verification and plugin install rollback.
- Signing keys, trust roots and evidence hygiene.

## Rollback

Rollback occurs per child using versioned policy/scanner/key/eligibility contracts. Never restore a path that bypasses archive safety, revocation or artifact digest verification. Historical audit/evidence records remain immutable.
