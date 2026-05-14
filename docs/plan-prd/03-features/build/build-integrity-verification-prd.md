# 构建完整性验证系统 PRD

> 状态：当前参考 / 压缩版
> 更新时间：2026-05-14
> 完整快照：`./archive/build-integrity-verification-prd.full-2026-05-14.md`

## TL;DR

构建完整性验证用于保证桌面包运行时依赖闭包、平台 native 依赖与 release metadata 可复核。当前 release 仍需结合 `quality:release` 与实际 build/verifier 结果判断。

## 当前原则

- packaged runtime modules 必须包含完整依赖闭包。
- 平台 native 包与 runtime module root 清单必须来源一致，避免 afterPack/verifier 各自维护。
- beta/snapshot tag 必须保持 pre-release 语义。
- 缺失关键运行时依赖应在构建阶段 fail-fast，而不是用户启动时报错。

## 关联入口

- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `.github/workflows/README.md`
- `docs/plan-prd/docs/github-automation.zh-CN.md`
- `docs/plan-prd/TODO.md`
