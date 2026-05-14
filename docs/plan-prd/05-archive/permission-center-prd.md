# PRD: 插件权限中心（Permission Center）

> 状态：Archived / 历史 PRD
> 更新时间：2026-05-14
> 完整快照：`./full/permission-center-prd.full-2026-05-14.md`
> 当前入口：`../docs/PRD-QUALITY-BASELINE.md`、`../TODO.md`

## TL;DR

本文是早期插件权限中心 PRD，定义了权限分类、权限申请、运行时拦截、审计日志、权限撤销与 SDK 版本门控。当前权限体系已演进为 SDKAPI hard-cut、capability auth baseline、typed transport 权限映射与 Quality Baseline 强约束，因此本文件仅作历史参考。

## 历史有效结论

- 插件能力必须有显式权限声明与用户知情。
- 高风险能力如 `fs.write`、`fs.execute`、`system.shell`、`window.capture` 需要更高等级拦截与审计。
- 权限撤销后运行时调用必须被拦截。
- 插件 sensitive operation 需要审计日志。

## 当前项目口径

- `sdkapi` 缺失、低于 floor、非法或不支持 marker 直接 `SDKAPI_BLOCKED`。
- 插件调用 native screenshot/file/media 等能力必须按域声明 `window.capture`、`fs.index`、`fs.read`、`media.read`。
- 插件 provider secret 不得进入普通 plugin storage，必须进入 secret capability、secure store 或加密引用。
- 插件 shell capability 必须暴露 platform、permission、unsupported/degraded reason 与审计字段。

## 不再作为当前依据的内容

- 未声明或低版本 `sdkapi` 跳过权限校验的旧设计。
- 早期权限预设与当前 capability matrix 不一致的条目。
- 未对齐 SDKAPI hard-cut 与 typed permission mapping 的旧流程。

## 关联入口

- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `packages/utils/plugin/sdk-version.ts`
