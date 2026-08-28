# 技术设计

## 交付拓扑

```text
安全与可信测试
  -> CI/CD + release gate -> OTA 真机
  -> AI provider + permission + sandbox
  -> manifest/data/telemetry/billing/privacy
  -> 官网功能矩阵 + 逐插件 SDK
  -> 跨平台集成、打包与发布候选
```

- 父任务只维护交付顺序、跨子任务合同和最终集成验收；具体实现与证据归属各子任务。
- 自动化测试采用“失败属性”而不是文本代理：能跳过的能力必须有正向控制，未处理异常必须令进程失败。
- 同一能力只保留一个事实源。版本取 manifest/package，发布取同 SHA workflow/artifact，产品状态取功能矩阵与可执行证据。
- 平台能力按 `supported / degraded / unavailable` 报告；无法在当前平台验证的项进入对应平台 CI 或真机 smoke，不推断通过。

## 集成边界

- CoreApp privileged path：typed transport -> authoritative caller -> permission -> domain owner -> audit/cleanup。
- Nexus/网络：运行时 Nexus Token 只进入严格同源请求；自定义源、包地址和重定向逐跳重新判定。
- AI：provider credential -> secure store -> routing -> permission/confirmation -> invocation/stream -> usage/billing/audit。
- 发布：quality gate -> build -> sign/notarize -> artifact manifest -> release -> updater manifest -> N/N+1 health ack。
- 插件：source -> build -> manifest validation -> package/sign/scan -> Nexus channel -> isolated install -> runtime smoke。

## 证据模型

每个矩阵项记录：能力、owner、入口、平台、稳定级别、自动化命令、真实 smoke、产物或日志摘要、剩余风险。敏感 Token、Key、Cookie、用户数据和完整 profile 不进入证据。

## 回滚与隔离

- 每个子任务只修改其 owner 文件，失败时保留诊断并停止进入下一阶段。
- 真机和插件安装使用隔离 profile；生产 Nexus 只走现有受支持 API/CLI，不直接修改数据库。
- 当前工作区已有改动视为用户资产；任何重叠修改都基于现状增量完成。
