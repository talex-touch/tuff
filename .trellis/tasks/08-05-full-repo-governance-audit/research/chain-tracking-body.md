> Filed by the full-repo governance audit sweep. Tracked via the `audit` label. This is a **tracking issue** that links four individually-filed findings which compose into one exploit chain.

## Summary

Four separately-filed issues form a single chain from a renderer XSS **or** a sandboxed plugin view to **arbitrary local program execution**. Each link is filed on its own because each is independently fixable, but **fixing any one link alone does not close the chain** — this issue tracks them together.

## The chain

1. **#689** — Renderer CSP is effectively disabled (`script-src * 'unsafe-inline' 'unsafe-eval'`), so any injected/hosted script runs in the renderer.
2. **#693** — The preload bridges the entire `electronAPI`, including raw `ipcRenderer`, into the page world with no allowlist.
3. **#688** — Every transport handler is registered on **both** the MAIN and PLUGIN channels with no default-deny, so `channel-core` forcing `type: PLUGIN` for plugin webContents buys nothing: any plugin page can invoke any main-process handler by name.
4. **#687** — `system.executeCommand` / `system.openApp` pass an unvalidated string to `shell.openPath` — the execution sink.

**Endpoint:** arbitrary local program execution reachable from either a renderer XSS or a sandboxed plugin view.

## Compounding

- **#690** — Plugin-install handlers build temp paths from an unsanitized IPC-supplied `name` (arbitrary file write). Composes with the above into **write-then-execute** (drop a startup/LaunchAgent entry, then trigger it).

## Scope / accurate framing

The window & isolation layer itself is **well-built** — `core/window-security-profile.ts` force-strips caller overrides of `sandbox`/`contextIsolation`/`webSecurity`/`nodeIntegration`/`webviewTag`, and `plugin/runtime/plugin-window-policy.ts` is a thorough per-plugin isolation layer (navigation + window-open deny + per-partition session + permission deny + webRequest allowlist). The finding is **not** that isolation is missing; it is that the **capability surface behind it** — the IPC/transport handler set exposed to the plugin channel and the page world — was not narrowed to match.

## Suggested closure order

Do **(3)** default-deny/allowlist the plugin channel and **(2)** stop bridging raw `ipcRenderer` first — that collapses the chain before (1)/(4) are even hardened. Then tighten **(1)** the CSP and **(4)** the shell sink.

---
<sub>audit tracking issue · links: #689 #693 #688 #687 #690</sub>
