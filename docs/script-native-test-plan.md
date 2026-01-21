# 脚本/原生能力测试计划与作者文档

## Scope
- 覆盖脚本/原生桥接的单测、集成测试与手工验证。
- 提供作者侧使用示例（配置、调用、错误处理）。

## Summary
- 测试分为核心桥接、平台适配与依赖探测三类。
- 文档示例以 TuffTransport 事件为入口，强调错误分支处理。

## References
- docs/script-native-bridge.md
- docs/script-native-constraints.md
- docs/script-native-capability-matrix.md
- docs/script-native-python-runtime.md
- docs/script-native-native-integration.md
- docs/script-native-provider-examples.md

---

## 1) 测试计划清单

### 单元测试（建议）
1. 运行时探测：
   - system python 检测命中/未命中。
   - embedded python 路径解析命中/未命中。
2. 配置读取与开关：
   - `config/script-bridge.json` 开关生效（enabled/allowlist/denylist）。
3. 错误映射：
   - timeout → `status=timeout`，包含安全错误信息。
   - 不支持平台 → `status=error`，`reason=unsupported`.

### 集成测试（建议）
1. Script invoke 基线：
   - `script:bridge:invoke` + 短命令（echo/ls）成功。
2. Sidecar 崩溃隔离：
   - sidecar 强制退出 → 主进程不中断，返回 `status=error`。
3. 权限提示流程：
   - shutdown/restart 在权限不足时返回可提示错误。

### 手工验证（平台）
1. Windows：
   - Everything 不可用时降级提示一致。
2. macOS：
   - AppleScript 执行 + 用户取消。
3. Linux：
   - shell 路径缺失 → 返回明确错误。

---

## 2) 关键场景与错误用例（至少 3 组）

| 场景 | 输入 | 期望输出 | 错误用例 |
| --- | --- | --- | --- |
| Python 脚本执行 | 简单脚本 / echo | `status=ok`，stdout 有值 | Python 缺失 → `status=error` |
| Sidecar 调用 | sidecar ping | `status=ok`，返回健康信息 | sidecar crash → `status=error` |
| 系统指令 | shutdown/restart | 需权限，提示用户 | 权限不足 → `status=error` |
| Everything 搜索 | 关键词查询 | 返回结果数组 | `es.exe` 缺失 → 降级提示 |

---

## 3) 作者文档示例（配置 + 调用）

### 配置示例
`config/script-bridge.json`：
```json
{
  "enabled": true,
  "defaultTimeoutMs": 10000,
  "providerAllowlist": ["python", "native-sidecar"],
  "providers": {
    "python": {
      "enabled": true,
      "runtime": "system"
    }
  }
}
```

### 调用示例（伪代码）
```ts
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { getTuffTransportRenderer } from '@talex-touch/utils/transport'

const scriptInvoke = defineRawEvent('script:bridge:invoke')

const transport = getTuffTransportRenderer(window.electron?.channel)
const result = await transport.send(scriptInvoke, {
  providerId: 'python',
  kind: 'script',
  action: 'run',
  args: { script: 'print(\"hello\")' },
  timeoutMs: 5000
})

if (result.status !== 'ok') {
  // 显示降级提示或错误信息
}
```

### 错误处理建议
- `timeout`：提示“任务超时，请稍后重试或减少输入”。
- `unsupported`：提示“该平台暂不支持此能力”。
- `permission_denied`：提示“需要管理员权限”。

---

## 4) 回归验证建议

- `script:bridge:invoke` / `native:bridge:invoke` 返回结构保持一致。
- 关闭开关后主流程正常（不影响搜索/插件）。
- 更新文档不改变现有使用方式。
