# 技术设计

## 门禁拓扑

```text
PR / master SHA
  -> deterministic CI quality jobs -> required checks

tag / manual release SHA
  -> release quality gate
  -> platform build matrix
  -> native signing + package attestation
  -> artifact/manifest/signature summary
  -> GitHub Release
  -> Nexus projection + updater discovery
  -> N/N+1 isolated runtime acceptance
```

- Release gate 在同一 workflow/SHA 内拥有 build 的 `needs` 依赖，避免依赖另一个并行 workflow 的时间窗口。
- 常规 CI job 名保持稳定、无路径过滤；package 专属 workflows 负责更深的按包验证，但不承担全仓 required check 唯一性。
- release 只消费已验证 artifact；manifest、签名侧车、build attestation、release notes 与 Nexus projection 均由 artifact SHA/version/tag 关联。

## OTA 证据流

```text
published N+1
  -> Nexus signed URL -> bytes/hash/signature
  -> persisted attempt -> verifying -> ready
  -> native notification click -> install-scheduled
  -> BEFORE_MODULES_UNLOAD preflight -> handoff-started
  -> detached helper -> replace N with N+1
  -> target startup -> awaiting-health -> healthy + token ack
  -> retain verified N as previous/recovery
```

- macOS 使用官方签名且可写的隔离 app bundle；不安装到真实 `/Applications`，不使用真实 profile。
- Windows/Linux 由各自 runner 执行，结果按 runtime/static-only 分开记录。
- 所有烟测使用固定阶段、版本、attempt id 和 bounded timestamps；日志与证据在持久化前脱敏。

## 失败与回滚

- quality gate 失败时 platform build 与 create-release 均不运行。
- release asset 不一致时停止 GitHub Release/Nexus sync，不覆盖已发布版本。
- OTA preflight 失败保持 `ready`；替换失败恢复旧 bundle；health timeout 只按 manifest/attempt 的 previous target 恢复一次。
