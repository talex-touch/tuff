# Browser Login Recovery Evidence Mode

Date: 2026-05-18

This note records the source-side support for the CoreApp visible-experience `browser-login-recovery` capture.

- The main auth module can opt into a deterministic device-auth start response only when `TUFF_VISIBLE_EVIDENCE_AUTH=1` and packaged startup benchmark mode is enabled.
- The evidence mode can force `shell.openExternal` failure while keeping the device authorization session alive, so Settings can show manual sign-in link and short-code recovery actions.
- The preload bridge exposes a read-only evidence config for shortening the renderer login timeout during packaged capture. Normal runtime keeps the production two-minute timeout.
- The visible evidence item still requires real packaged Electron/CDP screenshots before it can be marked passed.
