---
mode: plan
cwd: /Users/talexdreamsoul/Workspace/Projects/talex-touch
task: Nexus 官网首页内容整改（现状梳理与补全）
complexity: medium
planning_method: builtin
created_at: 2026-01-21T13:25:00+0800
---

# Plan: Nexus 官网首页内容整改

🎯 任务概述
针对 Nexus 官网首页目前存在的占位/空内容问题，先梳理现状与缺口，再制定内容与结构整改方案，最终补齐文案、视觉与交互，确保中英文一致且可落地。

🧾 现状清单
- 入口与结构：首页入口在 `apps/nexus/app/pages/index.vue`，渲染 `apps/nexus/app/components/tuff/TuffHome.vue`；页面由多个 landing section 组成。
- Hero：`apps/nexus/app/components/tuff/landing/TuffLandingHero.vue` 使用 i18n，但描述段落与 bullet 列表被注释/未渲染；Hero 统计/高亮的数据定义在 `apps/nexus/app/data/tuffHeroContent.ts`，当前未被使用。
- Stats/Showcase：`apps/nexus/app/components/tuff/landing/TuffLandingStats.vue` 依赖 `apps/nexus/app/components/tuff/landing/showcase/TuffShowcaseDisplayer.vue`，其中 slides 均为 `scenario: null` 且 `caption: ''`，实际呈现为占位文案（Showcase slot）。
- Plugins：`apps/nexus/app/components/tuff/landing/TuffLandingPlugins.vue` 的卡片内文是占位英文段落 + 外链图片；`PluginCardTranslate` 未被实际使用。
- AI Overview：`apps/nexus/app/components/tuff/landing/TuffLandingAiOverview.vue` 的 hero 文案与 CTA 被注释掉，仅展示渐变占位；highlights 文案未可视化。
- Built For You：角色卡片有文案，但 stats 计算后未渲染，导致数据闲置。
- Features：`apps/nexus/app/components/tuff/landing/TuffLandingFeatures.vue` 展示项为硬编码英文内容，非 i18n，且与页面其他模块的内容源不一致。
- Integrations/Craftsmanship：`apps/nexus/app/components/tuff/landing/TuffLandingIntegrations.vue` 卡片内存在 “Motion Preview” 占位区块，无真实动效或素材。
- Community：`apps/nexus/app/components/tuff/landing/TuffLandingCommunity.vue` 渠道链接 href 多为 `#` 占位，未指向真实入口。
- 未启用模块：`apps/nexus/app/components/tuff/TuffHome.vue` 内 `StarSnippets`、`Aggregation`、`Pricing` 未开启；Experience section 被注释。

📋 执行计划
1. 明确整改范围与目标：确认首页要保留/新增/下线的 section，确定“空内容”补齐优先级与目标转化路径（下载/订阅/文档）。
2. 建立内容矩阵：逐段梳理每个 section 的文案、链接、素材与数据来源（zh/en），列出缺口清单与负责人。
3. 补齐交互与数据：为 `TuffShowcaseDisplayer` 提供真实场景数据；补上 AI Overview 轮播/高亮内容；恢复 Hero 描述与 bullets，并决定是否引入 `tuffHeroContent.ts` 数据或清理冗余。
4. 替换占位与外链素材：整理插件卡片、动效预览、展示图，替换占位文字与外链资源，确保资源本地化与可缓存。
5. 结构与可见性调整：决定是否启用 Aggregation/StarSnippets/Pricing；恢复或删除 Experience 区块；补齐 Built For You stats、Community 真实链接。
6. 国际化与一致性校验：同步 zh/en 文案与链接；将硬编码英文内容迁移到 i18n；统一 CTA 命名与跳转。
7. 验证与回归：本地运行 Nexus 预览并做多端检查（移动/桌面）；执行 `pnpm -C "apps/nexus" run lint`，必要时补充基本 E2E/截图对比流程。

⚠️ 风险与注意事项
- 内容与素材需要产品/市场确认，存在依赖阻塞。
- 中英文文案同步成本高，需避免新增硬编码与多处重复维护。
- 视觉资源替换可能影响加载性能，需评估压缩与懒加载策略。

📎 参考
- `apps/nexus/app/pages/index.vue`
- `apps/nexus/app/components/tuff/TuffHome.vue`
- `apps/nexus/app/components/tuff/landing/TuffLandingHero.vue`
- `apps/nexus/app/components/tuff/landing/TuffLandingStats.vue`
- `apps/nexus/app/components/tuff/landing/showcase/TuffShowcaseDisplayer.vue`
- `apps/nexus/app/components/tuff/landing/TuffLandingPlugins.vue`
- `apps/nexus/app/components/tuff/landing/TuffLandingAiOverview.vue`
- `apps/nexus/app/components/tuff/landing/TuffLandingBuiltForYou.vue`
- `apps/nexus/app/components/tuff/landing/TuffLandingFeatures.vue`
- `apps/nexus/app/components/tuff/landing/TuffLandingIntegrations.vue`
- `apps/nexus/app/components/tuff/landing/TuffLandingCommunity.vue`
- `apps/nexus/app/data/tuffHeroContent.ts`
- `apps/nexus/i18n/locales/zh.ts`
- `apps/nexus/i18n/locales/en.ts`
