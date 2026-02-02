# Tuff Nexus 构建内存占用分析（2026-02-02）

## 结论（先看）
- 本地用 4G heap 仍然 OOM，崩溃点在 Nitro server build 阶段，堆占用约 4.07GB。
- Cloudflare Pages 上的 Sentry 401 与构建内存 OOM 无直接因果，但 sourcemap 上传本身会增加内存压力。
- `PostCSS Lexical error: component` 来自 UnoCSS 生成的异常类名 `m[pascalCase(component)]`，会触发警告但不一定导致构建失败。

## 复现信息
- 命令：`NODE_OPTIONS="--max-old-space-size=4096" pnpm run -F @talex-touch/tuff-nexus build`
- 本地 Node：v25.2.1（与 CI 的 v22.16.0 不一致，可能影响内存曲线）
- 日志：`/tmp/tuff-nexus-build-4g.log`
- 关键错误：`FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`

## 高占用点（按影响排序）
> 以下分为“已确认”和“高概率”，未做 heap profile，仅基于构建流程与日志证据。

1) **已确认：Nitro server build + Rollup**
   - OOM 发生在 `Building Nuxt Nitro server (preset: cloudflare-pages)` 阶段。
   - 该阶段需要打包 server 端、运行 rollup 插件链、产出 worker 产物，属于内存峰值期。

2) **高概率：Sentry sourcemap 处理与上传**
   - 日志中多次出现 `sentry-vite-plugin` / `sentry-rollup-plugin` 上传大量 sourcemap。
   - 上传流程会收集、读取、压缩/处理 map 文件，内存占用不小。

3) **高概率：UnoCSS + presetTypography + docs 内容扫描**
   - 生成的 `entry.*.css` 体积很大，且包含大量 utility。
   - 异常类 `m[pascalCase(component)]` 说明代码块/文档片段被错误抽取为 class，导致 CSS 进一步膨胀。

4) **中概率：@nuxt/content + nativeSqlite**
   - 内容索引 334 文件（日志确认），生成 `sql_dump` 与索引时会消耗内存。

5) **中概率：PWA Workbox precache**
   - precache 505 entries（约 20MB+），生成 manifest 与 SW 也会增加内存峰值。

## 证据/日志摘录（摘要）
- `FATAL ERROR: ... heap out of memory`
- `Building Nuxt Nitro server (preset: cloudflare-pages)` 后 OOM
- `[@nuxt/content] Processed 3 collections and 334 files`
- `PWA ... precache 505 entries`
- `Lexical error ... Erroneous area: 1: component`
- Sentry 上传成功（本地）或 401（Cloudflare）

## Sentry token 使用路径（为何“配置了可能没生效”）
- `apps/nexus/nuxt.config.ts` 默认只加载 `.env` / `.env.*` / `.env.local` / `.env.*.local`。
- `.env.sentry-build-plugin` **不会被自动加载**，除非显式 `loadEnv()`。
- `@sentry/nuxt` 最终读取 `process.env.SENTRY_AUTH_TOKEN`。
- Cloudflare Pages 需要在对应环境（Production/Preview）设置 `SENTRY_AUTH_TOKEN`，且 token 必须属于 `org=quotawish` 并具备 `project:releases` / `org:read` 等权限。

## 本次已做的优化（代码层）
- **Sentry sourcemap 上传条件化**：只有存在 `SENTRY_AUTH_TOKEN` 时才开启上传，否则禁用。
- **支持 `.env.sentry-build-plugin`**：让本地构建可直接读取该文件。
- **UnoCSS blocklist**：阻断 `m[pascalCase(component)]` 这类异常 class，避免无效 CSS 与 PostCSS 警告扩散。
- **Cloudflare 构建 heap 上限**：在 `wrangler.toml` 中设置 `NODE_OPTIONS=--max-old-space-size=6144`。
- **构建诊断输出**：构建时打印系统内存与 V8 heap 上限，便于确认 Pages 实际限制。

## 进一步优化建议
1) **对齐 Node 版本**
   - 用 v22.16.0 复测，避免 v25 在 GC/heap 策略上的差异造成放大。
2) **降低 Nitro 阶段内存峰值**
   - CI 中提高 `NODE_OPTIONS`（如 6G/8G），或拆分构建步骤。
3) **减少 sourcemap 负担**
   - CI 未配置或不需要 Sentry 时，彻底关闭 sourcemap 上传。
4) **收紧 UnoCSS 抽取范围**
   - 若 docs 页面无需依赖 UnoCSS class，可考虑排除部分文档路径。
5) **内容构建优化**
   - 检查是否有超大 md/mdc 文件，必要时拆分或按需生成。

## 后续验证建议
- 复测 4G heap + Node 22（对比 v25）
- 对比“关闭 Sentry 上传”与“开启上传”的峰值内存
- 观察 UnoCSS blocklist 生效后是否消除 PostCSS 警告
