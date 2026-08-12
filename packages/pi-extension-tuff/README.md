# @talex-touch/pi-extension-tuff

Registers Tuff's tools with the `pi` agent. Each tool is a thin forwarder: it
POSTs to the loopback gateway the desktop app opened for this session and
returns whatever the app answers. Nothing executes inside the agent process, so
every call passes the app's confirmation gate.

The app injects two environment variables when it spawns `pi`:

| Variable | Meaning |
|---|---|
| `TUFF_TOOL_GATEWAY_URL` | Loopback `/invoke` endpoint for this session |
| `TUFF_TOOL_GATEWAY_TOKEN` | Bearer token, rotated per session |

Without them the extension registers nothing — a `pi` run outside Tuff simply
does not see these tools.

## Development install

```bash
pi install /Users/<you>/Workspace/Projects/talex-touch/packages/pi-extension-tuff -l
```

`-l` keeps it local to the current project rather than the user profile.
