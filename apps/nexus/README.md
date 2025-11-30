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

This project uses Clerk for authentication. Before starting the dev server, create a Clerk application and set at least:

```bash
NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

Additional optional variables (domain, proxy URL, webhook secret, etc.) are described in `SETUP.md`.
