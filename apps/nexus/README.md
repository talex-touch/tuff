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

## Recent updates

- 登录入口现在会携带 `redirect_url`，用户从任意页面进入/退出账号后都会回到原来的页面而不是被强制带到首页
- 语言偏好支持持久化（Cookie + localStorage + 必要配置同步），新访客会优先使用浏览器语言，中文用户会自动进入中文文档，刷新不再回退到默认英文
