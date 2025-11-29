# Manifest Reference

## Schema
| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | ✓ | Reverse-domain unique ID |
| `name` | string or map | ✓ | Display name, supports locales |
| `description` | string |  | Short summary |
| `version` | string | ✓ | SemVer |
| `entry` | string | ✓ | Path to init entry |
| `preload` | string |  | Renderer preload file |
| `dev.enable` | boolean |  | Enable hot reload |
| `permissions` | string[] |  | `clipboard`, `storage`, `network`, ... |
| `acceptedInputTypes` | string[] |  | `text`, `image`, `files`, `html` |
| `features` | object[] |  | CoreBox commands, widgets, workflow nodes |

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
