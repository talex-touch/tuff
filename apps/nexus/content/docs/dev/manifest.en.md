# Manifest Reference

## Schema
| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | ✓ | Reverse-domain unique ID |
| `name` | string or map | ✓ | Display name, supports locales |
| `description` | string |  | Short summary |
| `version` | string | ✓ | SemVer |
| `sdkapi` | number | **Recommended** | SDK API version, format YYMMDD (e.g., 251212) |
| `entry` | string | ✓ | Path to init entry |
| `preload` | string |  | Renderer preload file |
| `dev.enable` | boolean |  | Enable hot reload |
| `permissions` | string[] |  | `clipboard`, `storage`, `network`, ... |
| `acceptedInputTypes` | string[] |  | `text`, `image`, `files`, `html` |
| `features` | object[] |  | CoreBox commands, widgets, workflow nodes |

## SDK API Version (sdkapi)

The `sdkapi` field declares the SDK API version the plugin is compatible with. Format is `YYMMDD` (year-month-day).

- **Current version**: `251212` (2025-12-12)
- **Not declared or below 251212**: Permission checks are bypassed, but users will see a warning about legacy SDK
- **Equal to or above 251212**: Full permission enforcement enabled

New plugins should always declare the latest `sdkapi` version for complete permission protection.

## Example
```json
{
  "id": "com.tuff.todo",
  "name": {
    "default": "Todo",
    "zh-CN": "待办"
  },
  "description": "Capture and sync todos",
  "version": "1.3.0",
  "sdkapi": 251212,
  "entry": "init/index.ts",
  "features": [
    {
      "type": "corebox",
      "id": "todo.new",
      "title": "Create Todo",
      "keywords": ["todo", "task"],
      "queryMode": "text"
    }
  ],
  "permissions": ["storage", "clipboard"],
  "acceptedInputTypes": ["text", "files"]
}
```

## Validation Checklist
- `id` must be unique and alphanumeric with dots.
- `version` follows `major.minor.patch` for update ordering.
- Declaring `network` requires whitelisting external domains.

## Frequent Issues
| Issue | Fix |
| --- | --- |
| Missing entry | Set `entry` to `init/index.ts` and ensure the file exists. |
| Excessive permissions | Request only what you truly need, especially for v1. |
| Keyword collisions | Namespace features like `todo.*` to avoid conflicts. |
