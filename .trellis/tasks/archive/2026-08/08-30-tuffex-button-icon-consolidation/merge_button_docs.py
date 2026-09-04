#!/usr/bin/env python3
"""Merge icon-button + copy-button content into button.{zh,en}.mdc. Anchors assert."""
BASE = 'apps/nexus/content/docs/dev/components'

API_ZH = """### IconButton Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `icon` | `string` | `''` | 未提供默认插槽时，通过 `TxIcon` 渲染的图标名称。 |
| `label` | `string` | `''` | 可访问名称。纯图标操作必填。 |
| `size` | `'xs' \\| 'sm' \\| 'md' \\| 'lg'` | `'md'` | 按钮尺寸。 |
| `shape` | `'square' \\| 'circle' \\| 'pill'` | `'square'` | 点击区域轮廓。 |
| `status` | `'success' \\| 'warning' \\| 'danger' \\| 'info'` | - | 语义视觉状态色；未设置时保持中性样式。 |
| `pressed` | `boolean` | - | 持久切换态；定义后转发为 `aria-pressed`。 |
| `disabled` | `boolean` | `false` | 原生禁用态与禁用样式。 |
| `nativeType` | `'button' \\| 'submit' \\| 'reset'` | `'button'` | 原生 `type` 属性。 |
- `status` 会改变图标的语义颜色、悬停、按下和焦点样式；不改变行为，也不提供授权。

### IconButton Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `click` | `(event: MouseEvent)` | 启用状态下点击后触发。 |

### IconButton Slots

| 插槽名 | Props | 说明 |
|------|------|------|
| `default` | `{ hover, pressed }` | 自定义图标或动画内容。 |

### CopyButton Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `text` | `string` | `''` | 写入剪贴板的文本。 |
| `copyLabel` | `string` | `'Copy'` | 空闲状态文案和 aria-label。 |
| `copiedLabel` | `string` | `'Copied'` | 成功状态文案和 aria-label。 |
| `disabled` | `boolean` | `false` | 禁用按钮并阻止复制。 |
| `timeout` | `number` | `1400` | 复制完成状态重置延迟，单位 ms。 |
| `size` | `'sm' \\| 'md'` | `'sm'` | 按钮密度。 |

### CopyButton Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `copy` | `(text: string)` | 剪贴板写入成功后触发。 |
| `error` | `(error: unknown)` | 剪贴板写入失败时触发。 |

### CopyButton Slots

| 插槽名 | Props | 说明 |
|------|------|------|
| `default` | `{ copied, copying }` | 自定义按钮文案或内容。 |

"""

API_EN = """### IconButton Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `icon` | `string` | `''` | Icon class/name rendered through `TxIcon` when no default slot is provided. |
| `label` | `string` | `''` | Accessible label. Required for icon-only actions. |
| `size` | `'xs' \\| 'sm' \\| 'md' \\| 'lg'` | `'md'` | Button size. |
| `shape` | `'square' \\| 'circle' \\| 'pill'` | `'square'` | Hit-area silhouette. |
| `status` | `'success' \\| 'warning' \\| 'danger' \\| 'info'` | - | Semantic visual tone; omitted keeps the neutral style. |
| `pressed` | `boolean` | - | Toggle state; forwarded to `aria-pressed` when defined. |
| `disabled` | `boolean` | `false` | Native disabled state and visual disabled class. |
| `nativeType` | `'button' \\| 'submit' \\| 'reset'` | `'button'` | Native `type` attribute. |
- `status` changes the semantic icon color, hover, pressed, and focus treatments; it does not change behavior or provide authorization.

### IconButton Events

| Event | Params | Description |
|------|--------|-------------|
| `click` | `(event: MouseEvent)` | Emitted for enabled clicks. |

### IconButton Slots

| Slot | Props | Description |
|------|------|-------------|
| `default` | `{ hover, pressed }` | Custom icon or animated content. |

### CopyButton Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string` | `''` | Text written to the clipboard. |
| `copyLabel` | `string` | `'Copy'` | Idle label and aria-label. |
| `copiedLabel` | `string` | `'Copied'` | Success label and aria-label. |
| `disabled` | `boolean` | `false` | Disables the button and prevents copy. |
| `timeout` | `number` | `1400` | Milliseconds before copied state resets. |
| `size` | `'sm' \\| 'md'` | `'sm'` | Button density. |

### CopyButton Events

| Event | Params | Description |
|------|--------|-------------|
| `copy` | `(text: string)` | Emitted after successful clipboard write. |
| `error` | `(error: unknown)` | Emitted when clipboard write fails. |

### CopyButton Slots

| Slot | Props | Description |
|------|------|-------------|
| `default` | `{ copied, copying }` | Custom button label/content. |

"""

ICON_DEMO_ZH = """  <script setup lang="ts">
  import { ref } from 'vue'

  const pinned = ref(false)
  </script>

  <template>
    <div class="flex flex-wrap items-center gap-3">
      <TxIconButton
        icon="i-carbon-star"
        label="置顶工作区"
        shape="circle"
        :pressed="pinned"
        @click="pinned = !pinned"
      />
      <TxIconButton icon="i-carbon-edit" label="编辑项目" shape="square" status="info" />
      <TxIconButton icon="i-carbon-add" label="新增项目" shape="pill" size="lg" status="success" />
      <TxIconButton icon="i-carbon-warning" label="需要注意的操作" status="warning" />
      <TxIconButton icon="i-carbon-trash-can" label="删除项目" status="danger" disabled />
    </div>
  </template>"""

ICON_DEMO_EN = ICON_DEMO_ZH.replace('置顶工作区', 'Pin workspace').replace('编辑项目', 'Edit item') \
    .replace('新增项目', 'Add item').replace('需要注意的操作', 'Action needs attention').replace('删除项目', 'Delete item')

COPY_DEMO_ZH = """  <script setup lang="ts">
  const installCommand = 'pnpm add @talex-touch/tuffex'
  </script>

  <template>
    <TxCopyButton
      :text="installCommand"
      copy-label="复制安装命令"
      copied-label="已复制"
    />
  </template>"""

COPY_DEMO_EN = COPY_DEMO_ZH.replace('复制安装命令', 'Copy install command').replace('已复制', 'Copied')

def compose_notes(lang):
    icon_intro = ('纯图标动作按钮：`label` 提供可访问名称，`pressed` 承载持久切换态，`status` 提供语义状态色。'
                  if lang == 'zh'
                  else 'An icon-only action button: `label` supplies the accessible name, `pressed` carries a persistent toggle, and `status` adds semantic tones.')
    copy_intro = ('带复制完成反馈与错误事件的剪贴板按钮。'
                  if lang == 'zh'
                  else 'A clipboard button with copied feedback and error events.')
    icon_demo = ICON_DEMO_ZH if lang == 'zh' else ICON_DEMO_EN
    copy_demo = COPY_DEMO_ZH if lang == 'zh' else COPY_DEMO_EN
    return f"""### Icon Button

{icon_intro}

::::TuffDemoWrapper{{demo="IconButtonIconButtonDemo" code-lang="vue"}}
---
code: |
{icon_demo}
---
::::

### Copy Button

{copy_intro}

::::TuffDemoWrapper{{demo="CopyButtonCopyButtonDemo" code-lang="vue"}}
---
code: |
{copy_demo}
---
::::

"""

CONTRACT_ZH = """- `TxIconButton` 的 `label` 会成为 `aria-label`，纯图标按钮必须提供；`pressed` 是 boolean 时输出 `aria-pressed` 并应用激活样式；默认插槽接收 `{ hover, pressed }`。
- `TxCopyButton` 在 `disabled` 或复制进行中忽略点击；只有剪贴板写入成功后才触发 `copy`，两种剪贴板策略都失败时触发 `error`；成功后 `copiedLabel` 显示 `timeout` 毫秒后恢复。
"""
CONTRACT_EN = """- `TxIconButton` maps `label` to `aria-label` — provide it for icon-only controls; boolean `pressed` emits `aria-pressed` with active styling; the default slot receives `{ hover, pressed }`.
- `TxCopyButton` ignores clicks while `disabled` or copying; `copy` fires only after a successful clipboard write, `error` fires when both clipboard strategies fail, and `copiedLabel` shows for `timeout` milliseconds after success.
"""

PRACTICE_ZH = """- `TxIconButton` 除非插槽中有可见文本，否则始终设置 `label`；`pressed` 只用于持久开关，一次性动作使用普通点击按钮。
- `TxCopyButton` 的 `copyLabel` 应明确点名复制目标；复制值很关键时处理 `error`，浏览器可能拒绝非可信手势触发的剪贴板写入。
"""
PRACTICE_EN = """- For `TxIconButton`, always set `label` unless visible text is supplied through the slot; use `pressed` only for persistent toggles and normal click buttons for one-shot actions.
- Give `TxCopyButton` a `copyLabel` that names the target; handle `error` when the copied value is critical, since browsers can reject clipboard writes outside trusted gestures.
"""

REVIEW_ZH = """- **实测覆盖（IconButton / CopyButton）:** `packages/tuffex/packages/components/src/button/__tests__/icon-button.test.ts` 覆盖可访问名称告警与语义状态 class；`copy-button.test.ts` 覆盖剪贴板成功、已复制视觉状态、禁用无操作和错误派发。
"""
REVIEW_EN = """- **Verified coverage (IconButton / CopyButton):** `packages/tuffex/packages/components/src/button/__tests__/icon-button.test.ts` covers accessible-name warnings and semantic status classes; `copy-button.test.ts` covers clipboard success, copied visual state, disabled no-op, and error emission.
"""

SOURCE_ZH = """- IconButton / CopyButton：`packages/tuffex/packages/components/src/button/src/icon-button.vue`、`copy-button.vue` 与类型文件 `icon-button.ts`；`button/index.ts` 导出可安装的 `TxIconButton`、`TxCopyButton` 及实例类型。
"""
SOURCE_EN = """- IconButton / CopyButton: `packages/tuffex/packages/components/src/button/src/icon-button.vue`, `copy-button.vue`, and the `icon-button.ts` types file; `button/index.ts` exports installable `TxIconButton` / `TxCopyButton` with instance types.
"""

def insert_before(s, anchor, block, label):
    assert anchor in s, f'missing anchor: {label}'
    assert s.count(anchor) == 1, f'ambiguous anchor: {label}'
    return s.replace(anchor, block + anchor)

def insert_after(s, anchor, block, label):
    assert anchor in s, f'missing anchor: {label}'
    assert s.count(anchor) == 1, f'ambiguous anchor: {label}'
    return s.replace(anchor, anchor + block)

for lang in ['zh', 'en']:
    p = f'{BASE}/button.{lang}.mdc'
    s = open(p).read()

    # A. API sections before ## Types
    s = insert_before(s, '## Types\n', (API_ZH if lang == 'zh' else API_EN), 'types-heading')

    # B. Types code block
    old_import = "  import type { TxButtonEmits, TxButtonProps, TxSplitButtonEmits, TxSplitButtonProps } from '@talex-touch/tuffex'"
    new_import = "  import type { TxButtonEmits, TxButtonProps, TxIconButtonProps, TxSplitButtonEmits, TxSplitButtonProps } from '@talex-touch/tuffex'"
    assert old_import in s, 'types import'
    s = s.replace(old_import, new_import)
    s = insert_after(s, '  export interface SplitButtonEmits extends TxSplitButtonEmits {}\n',
                     '  export interface IconButtonProps extends TxIconButtonProps {}\n', 'types-tail')

    # C. Composition Notes additions before Interaction Contract heading
    contract_head = '## 交互契约\n' if lang == 'zh' else '## Interaction Contract\n'
    s = insert_before(s, contract_head, compose_notes(lang), 'contract-heading')

    # D. Interaction contract bullets after the TxSplitButton bullet
    tail_zh = '- `TxSplitButton` 在 loading 时会禁用主操作和菜单；`menuDisabled` 只额外禁用菜单触发器。\n'
    tail_en = '- `TxSplitButton` disables both action zones while loading; `menuDisabled` only disables the menu trigger.\n'
    s = insert_after(s, tail_zh if lang == 'zh' else tail_en, CONTRACT_ZH if lang == 'zh' else CONTRACT_EN, 'contract-tail')

    # E. Best practices bullets after the close() bullet
    bp_zh = '- `TxSplitButton` 的菜单动作完成选择后，应调用 slot 暴露的 `close()` 回调。\n'
    bp_en = '- Keep menu actions in `TxSplitButton` responsible for calling the provided `close()` callback after a selection.\n'
    s = insert_after(s, bp_zh if lang == 'zh' else bp_en, PRACTICE_ZH if lang == 'zh' else PRACTICE_EN, 'practice-tail')

    # F. Review notes line after the coverage bullet
    rv_zh = '`split-button.test.ts` 覆盖菜单渲染、主按钮点击、disabled/loading 阻断与 `menuOpenChange`。\n'
    rv_en = '`split-button.test.ts` covers menu rendering, primary click, disabled/loading suppression, and `menuOpenChange`.\n'
    s = insert_after(s, rv_zh if lang == 'zh' else rv_en, REVIEW_ZH if lang == 'zh' else REVIEW_EN, 'review-tail')

    # G. Source line after the Types source bullet
    src = '- Types: `packages/tuffex/packages/components/src/button/src/types.ts` and `packages/tuffex/packages/components/src/button/src/split-button.ts`.\n'
    s = insert_after(s, src, SOURCE_ZH if lang == 'zh' else SOURCE_EN, 'source-tail')

    open(p, 'w').write(s)
    print(p, 'merged OK')
