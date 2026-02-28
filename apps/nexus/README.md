# Tuff Docs

This is the documentation site for the Tuff project, built with Nuxt and Nuxt Content.

## Development

1.  Install dependencies:
    ```bash
    pnpm install
    ```
2.  Start the development server:
   ```bash
   pnpm run dev
   ```

The site will be available at `http://localhost:3000`.

## Authentication

This project uses NuxtAuth for authentication. Before starting the dev server, configure at least:

```bash
AUTH_SECRET=your_auth_secret
AUTH_ORIGIN=http://localhost:3200
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
RESEND_API_KEY=your_resend_key
AUTH_EMAIL_FROM="Tuff <noreply@tuff.chat>"
```

Additional optional variables are described in `SETUP.md`.

## Deployment environment variables

The Nexus deployment reads configuration from `.env*` files locally and from Cloudflare Pages environment variables in production. The list below is derived from `apps/nexus/nuxt.config.ts` and server utils.

Required in production:
- `AUTH_SECRET` (>= 16 chars, session + token signing fallback)
- `AUTH_ORIGIN` (public base URL; required by Passkeys)
- `APP_AUTH_JWT_SECRET` (recommended, >= 16 chars; avoids ephemeral JWT secret)
- `NUXT_INTELLIGENCE_ENCRYPT_KEY` (recommended, encrypts AI provider API keys)
- `ADMINSECRET` (required if you enable first-user admin bootstrap flow)

Auth providers (optional):
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `LINUXDO_CLIENT_ID`
- `LINUXDO_CLIENT_SECRET`
- `LINUXDO_ISSUER`

Email login / Magic Link (optional):
- `RESEND_API_KEY`
- `AUTH_EMAIL_FROM`
- `AUTH_EMAIL_SERVER`

Turnstile (optional):
- `TURNSTILE_SITEKEY` or `NUXT_PUBLIC_TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRETKEY` or `TURNSTILE_SECRET_KEY`

Cloudflare Pages runtime (optional unless you force Pages in non-prod):
- `NITRO_PRESET=cloudflare-pages`
- `NUXT_USE_CLOUDFLARE_DEV=true`
- `CLOUDFLARE_DEV_ENVIRONMENT`
- `RELEASE_SIGNATURE_PUBLIC_KEY` / `UPDATE_SIGNATURE_PUBLIC_KEY` (can also be Cloudflare bindings)

Observability & feature toggles (optional):
- `SENTRY_AUTH_TOKEN` (source maps upload; requires `NUXT_ENABLE_SENTRY_SOURCEMAPS=true`)
- `NUXT_DISABLE_SENTRY`
- `NUXT_ENABLE_SENTRY_SOURCEMAPS` (`true/1/on/yes` to enable Sentry source maps upload during build)
- `NUXT_DISABLE_PWA`
- `NUXT_PUBLIC_WATERMARK_ENABLED` (`true/1/on/yes` to enable watermark system)
- `NUXT_PUBLIC_RISK_CONTROL_ENABLED` (`true/1/on/yes` to enable risk control entrypoints)
- `VITE_PLUGIN_PWA`
- `NUXT_DISABLE_WEB_FONTS`
- `UNOCSS_WEBFONTS`
- `NUXT_DISABLE_SSR`
- `NUXT_DISABLE_PRERENDER`
- `NUXT_ENABLE_PAYLOAD_EXTRACTION`
- `NUXT_DISABLE_NITRO_MINIFY`
- `NUXT_DISABLE_NITRO_SOURCEMAP`
- `NUXT_AUTH_DEBUG`
- `TALEX_WORKFLOW_DEBUG`

Cloudflare bindings (wrangler / Pages settings):
- `DB` (D1)
- `R2`, `ASSETS`, `IMAGES`, `PACKAGES`, `PLUGIN_PACKAGES` (R2 buckets)
- `RELEASE_SIGNATURE_PUBLIC_KEY`, `UPDATE_SIGNATURE_PUBLIC_KEY` (string bindings)

## Recent updates

- 登录入口现在会携带 `redirect_url`，用户从任意页面进入/退出账号后都会回到原来的页面而不是被强制带到首页
- 语言偏好支持持久化（Cookie + localStorage + 必要配置同步），新访客会优先使用浏览器语言，中文用户会自动进入中文文档，刷新不再回退到默认英文
