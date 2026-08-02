# Nexus Preview Secret Deployment

> Cloudflare Pages Preview credential inventory, deployment preflight, runtime validation, and evidence contracts.

## Scenario: Fail-Closed Preview Credential Deployment

### 1. Scope / Trigger

Apply this contract when changing any of:

- `wrangler.toml` Preview variables or Cloudflare Pages bindings.
- `apps/nexus/package.json` Preview build/deploy commands.
- Nexus auth, app JWT, emergency-control, provider-key encryption, or other environment credentials.
- Cloudflare Pages Preview provisioning, deployment, smoke tests, or evidence claims.

The goal is to keep credential values out of deployable configuration while proving that remote Preview uses platform Secret bindings. Local Pages simulation is a separate, explicitly marked trust boundary.

### 2. Signatures

- Name-only catalog: `apps/nexus/shared/security/preview-secret-inventory.json` with disjoint `required`, `featureGated`, and `optional` arrays.
- Metadata decoder: `parsePreviewBindingMetadata(payload): Array<{ name: string; type: string | null }>`.
- Inventory guard: `assertPreviewCredentialBindings(bindings)`.
- Remote preflight: `runPreviewSecretPreflight(options?): Promise<{ required, featureGated, optional, projectName, branch }>`.
- Deployment entry: `runPreviewDeployment(options?): Promise<void>`.
- Package-manager resolver: `resolvePnpmInvocation(options?): { executable: string; prefixArgs: string[] }`.
- Runtime policy: `assertRuntimeCredential(variableName, value, { localDevelopment, minimumLength? }): string`.
- Runtime source selector: `selectRuntimeCredential(platformBindings, platformValue, fallbackValues): unknown`.
- Local Pages simulator marker: `NEXUS_LOCAL_PAGES_PREVIEW=true`, injected by `pnpm -C apps/nexus run preview:cf`.
- Local Nitro Cloudflare marker: `NUXT_USE_CLOUDFLARE_DEV=true`, set by the Nexus `dev` / `dev:cf` scripts and accepted only while `NODE_ENV !== 'production'`.
- Local binding adapter: `readCloudflareBindings(event)` preserves platform bindings and overlays only its explicit credential allowlist from `process.env` when the local Nitro marker is active.

Required Preview Secrets are:

- `AUTH_SECRET`
- `APP_AUTH_JWT_SECRET`
- `ADMIN_EMERGENCY_JWT_SECRET`
- `ADMIN_CONTROL_PLANE_PEPPER`

The catalog is the source of truth for feature-gated and optional credential names. Those names may be absent, but must use `secret_text` whenever configured.

### 3. Contracts

- `[env.preview.vars]` contains only non-sensitive values. Credential names and local-only markers are prohibited even when their value is empty.
- Cloudflare Pages project metadata is read from `deployment_configs.preview.env_vars`. Production bindings never satisfy Preview inventory.
- Preflight reads only binding names and types. It never reads, requests, stores, compares, or logs Secret values or the API token.
- Every required credential exists as `secret_text`. Every configured cataloged feature-gated/optional credential is also `secret_text`.
- Any remote `NEXUS_LOCAL_PAGES_PREVIEW` binding is rejected regardless of binding type.
- A valid non-empty Pages `production_branch` must differ from the fixed deployment branch `preview`.
- `deploy:cf` accepts no passthrough arguments, runs preflight before build and again before deploy, and verifies project/branch identity did not change.
- Cloudflare bindings are authoritative at runtime. When bindings exist, missing platform credentials do not fall back to build-time Nuxt config or `process.env`.
- Non-local credentials reject missing, short, documented placeholder, legacy default, and known local-only values. Errors contain only a stable code and variable name.
- Local defaults are accepted only when the explicit local Pages marker reaches the built Pages simulator or the non-production Nitro dev marker is active. Both markers are absent from deployable remote bindings and metadata.
- `nitro-cloudflare-dev` creates a platform binding object from `wrangler.toml`; app-scoped `.env` / `.env.local` credentials are not automatically present in that object. In explicit local Nitro mode, `readCloudflareBindings()` preserves D1/R2 and all other platform bindings, injects the local Pages marker into its returned view, and fills only allowlisted credential keys from `process.env` when the platform value is nullish.
- Existing platform credential values remain authoritative in local Nitro mode, including empty or otherwise invalid explicit values. Arbitrary process environment keys must never become Cloudflare bindings.
- App JWT may fall back from an absent `APP_AUTH_JWT_SECRET` to `AUTH_SECRET` only at its documented boundary. An explicitly present invalid primary value fails closed.
- POSIX native pnpm executables run directly; `.js/.cjs/.mjs` package-manager entries run through Node; Windows `.cmd/.bat` entries run through `ComSpec /d /s /c`.

### 4. Validation & Error Matrix

- Missing `CLOUDFLARE_ACCOUNT_ID` or `CLOUDFLARE_API_TOKEN` -> `PREVIEW_SECRET_PREFLIGHT_CONFIG_MISSING`, exit `64`.
- Cloudflare request, HTTP, JSON, or Preview metadata failure -> `PREVIEW_SECRET_METADATA_UNAVAILABLE`, exit `69`.
- Missing required Secret names -> `PREVIEW_SECRET_INVENTORY_MISSING`, exit `78`.
- Cataloged credential present as non-`secret_text` -> `PREVIEW_SECRET_BINDING_TYPE_INVALID`, exit `78`.
- Remote local marker at any type -> `PREVIEW_LOCAL_MARKER_REMOTE_BINDING`, exit `78`.
- Missing production branch metadata -> `PREVIEW_PRODUCTION_BRANCH_UNAVAILABLE`, exit `69`.
- Fixed Preview branch equals production branch -> `PREVIEW_DEPLOY_BRANCH_IS_PRODUCTION`, exit `78`.
- Deployment receives CLI overrides -> `PREVIEW_DEPLOY_ARGUMENTS_UNSUPPORTED`, exit `64`.
- Package manager or Windows command processor unavailable -> `PREVIEW_DEPLOY_PACKAGE_MANAGER_UNAVAILABLE`, exit `69`.
- Project or branch changes between preflights -> `PREVIEW_DEPLOY_TARGET_CHANGED`, exit `78`.
- Missing/short/placeholder/local-only non-local runtime value -> `NEXUS_RUNTIME_CREDENTIAL_INVALID`, HTTP `500`; raw value is never returned.
- Local Nitro bindings exist but omit an allowlisted credential -> use the corresponding process value only when `NODE_ENV !== 'production'` and `NUXT_USE_CLOUDFLARE_DEV=true`; otherwise retain the non-local rejection.
- Local Nitro platform binding contains an explicit value, including `''` -> keep the platform value; downstream validation decides whether to reject it.
- Local Nitro process environment contains a non-allowlisted key -> omit it from the binding view.

### 5. Good / Base / Bad Cases

- Good: Preview metadata contains the four required names as `secret_text`; optional OAuth credentials are absent; preflight passes twice; deployment targets branch `preview`; remote auth reaches its normal `200/401` boundary without a credential error.
- Good: local Nitro Cloudflare dev keeps Preview D1/R2 bindings, overlays a locally loaded `AUTH_SECRET`, marks the returned binding view as local, and serves the first Nuxt Content query without `NEXUS_RUNTIME_CREDENTIAL_INVALID`.
- Base: an optional Turnstile or OAuth secret is not configured because the feature is disabled; preflight still passes.
- Good: an optional credential is later enabled as `secret_text`; preflight reports only its name/category and continues without reading the value.
- Bad: committing `AUTH_SECRET = "change-me"`, an empty `GITHUB_CLIENT_SECRET`, or `NEXUS_LOCAL_PAGES_PREVIEW` under `[env.preview.vars]`.
- Bad: accepting a Production secret list as Preview evidence, trusting an unqualified Pages secret command, or treating local Wrangler smoke as deployed Preview proof.
- Bad: invoking a native pnpm binary as `node <pnpm-binary>`; Node parses binary bytes and deployment fails before build.
- Bad: fixing local Nitro dev by restoring credential values in `wrangler.toml`, copying all of `process.env` into bindings, or allowing process fallback whenever any Cloudflare binding object exists.

### 6. Tests Required

- Parse synthetic Cloudflare payloads with separate Production and Preview maps; assert only Preview names/types are used.
- Use throwing `value` accessors and canary values; assert parser/preflight never accesses or logs values/tokens.
- Cover complete and missing required inventories.
- Cover required, feature-gated, and optional credentials as `plain_text`; assert stable name-only rejection.
- Cover absent/`secret_text` optional credentials and unrelated public `plain_text` variables.
- Reject local marker at every binding type and reject a Preview branch equal to Production.
- Scan `wrangler.toml` Preview vars for every cataloged credential, local marker, and known local default.
- Table-test runtime missing, short, placeholder, legacy, local-only, strong, and explicit local-development values.
- Test the local Nitro adapter with D1/R2 preservation, allowlisted nullish credential overlay, explicit platform precedence, arbitrary environment exclusion, production no-overlay, and unmarked-development no-overlay.
- Test Cloudflare binding precedence over Nuxt/process fallback in auth, app JWT, emergency token, pepper, and feature-gated encryption boundaries.
- Test deployment ordering, second-preflight target identity, argument rejection, and POSIX native/JavaScript/Windows package-manager resolution.
- Run focused Vitest, Nexus typecheck, scoped ESLint/Prettier, Node syntax checks, deterministic config scan, and `git diff --check`.
- Final evidence requires a real Cloudflare Preview inventory preflight, a successful deployment whose environment is `Preview` and branch is `preview`, and remote auth/emergency boundary smoke. A disabled emergency route proves fail-closed wiring only; it does not prove enabled emergency operations.

### 7. Wrong vs Correct

#### Wrong

```toml
[env.preview.vars]
AUTH_SECRET = "change-me"
GITHUB_CLIENT_SECRET = ""
```

```js
// Wrong: Production/unqualified inventory is not Preview evidence.
execFileSync('wrangler', ['pages', 'secret', 'list'])
execFileSync(process.execPath, [process.env.npm_execpath, 'run', 'build'])

// Wrong: a local fix must not expose the whole process environment.
event.context.cloudflare.env = { ...bindings, ...process.env }
```

#### Correct

```toml
[env.preview.vars]
AUTH_ORIGIN = "http://localhost:3200"
ADMIN_BREAKGLASS_ENABLED = "false"
```

```js
const metadata = await readPagesProjectMetadata()
const bindings = parsePreviewBindingMetadata(metadata)
assertPreviewCredentialBindings(bindings)

const { executable, prefixArgs } = resolvePnpmInvocation()
execFileSync(executable, [...prefixArgs, 'run', 'build'])

// Local Nitro dev: platform values win; only named credentials may fall back.
const localBindings = { ...bindings, NEXUS_LOCAL_PAGES_PREVIEW: 'true' }
for (const name of LOCAL_CLOUDFLARE_DEV_CREDENTIAL_BINDINGS) {
  if (bindings[name] == null && process.env[name] != null)
    localBindings[name] = process.env[name]
}
```
