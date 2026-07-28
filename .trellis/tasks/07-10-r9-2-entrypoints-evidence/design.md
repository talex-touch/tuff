# Entrypoints And Evidence Design

## Shared Integration Adapter

每个入口只负责把自身 input/capsule/run intent 映射到统一 context-aware host request；session policy、package prepare、prompt assembly、citation、memory filter 和 provider invoke 都复用 CoreApp Intelligence 层。

## Entrypoint Policies

- CoreBox：new/continue/stateless，允许完整 session policy。
- OmniPanel：每次 panel action 建立轻量 session 或短生命周期 checkpoint，只带当前 selection/capsule 和明确 retrieval。
- Workflow：每个 workflow run 一个独立 session；step trace 关联 run id，跨 step 只传显式 workflow artifacts/context。
- Assistant：默认轻量短会话；仅在用户显式继续同一 Assistant session 时带 recent turns。

入口适配器不得把 renderer/plugin 本地 history 当成跨入口共享事实源。

## Evidence Levels

```text
unit/contract -> controlled integration -> packaged Electron -> real profile
```

manifest 对每条 case 记录 level、source、timestamp、build/runtime version、expected、observed、redaction status 和 artifact path。只有实际采集到对应层级才标记完成。

## Privacy

- 使用固定 synthetic prompts/documents/memory 采集 controlled evidence。
- 截图与 JSON 只保留 id、count、reason、citation metadata 和状态。
- 采集后运行敏感模式扫描；命中 token/key/password/prompt 原文则 evidence 无效。

## Rollout

按 CoreBox -> Workflow -> OmniPanel -> Assistant 顺序启用独立 feature flag。任一入口失败可回退 plain invoke/现有行为，不关闭其他入口，也不删除 session/package 数据。
