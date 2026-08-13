# Implement — 模型菜单接入 pi 目录与应用内提供方模型

工作目录 `apps/core-app/`。

## Checklist

1. [ ] **pi 目录读取**:新建 `src/main/modules/ai/providers/pi-model-catalog.ts`(接口/边界见 design.md;机密防线在返回类型出口)。
2. [ ] **单测**:`pi-model-catalog.test.ts` — 真实临时目录 fixture(含假 apiKey),覆盖解析/合并去重/损坏降级/mtime 缓存/机密不出现在序列化结果。
   - 验证:`npx vitest run src/main/modules/ai/providers/pi-model-catalog.test.ts`
3. [ ] **接入 model-options**:`intelligence-provider-model-options.ts` — pi provider 行改由 `listPiCliModels()` 填充,`probePiCliAvailability()` 为假时整行剔除;补/改既有测试。
   - 验证:`npx vitest run src/main/modules/ai/`
4. [ ] **空态文案**:zh/en `home.modelEmpty` 更新为同时覆盖「未配置提供方 / 未安装 pi」的表述(zh:「没有可用的模型,先配置一个 AI 提供方或安装 pi CLI」)。
5. [ ] **回归**:`npm run typecheck`;`npx vitest run src/main/modules/ai/ src/renderer/src/modules/conversation/`;改动文件 lint delta(包内配置,不整文件 --fix)。

## Review gates

- 步骤 2 后重点检查机密断言的严密性(fixture key 值是否真的会在错误实现下泄漏——先写一个故意泄漏的实现验证测试会红,再写正确实现)。
- 完成后 3.3:如 main-process spec 有 intelligence/provider 相关约定文档,补「pi 目录只读两文件、凭据不出主进程」条款。

## Rollback points

- 单 commit;revert 即回现状(pi 来源消失、菜单回到现空态),无存储/schema 变更。
