#!/usr/bin/env python3
"""Merge os-icon content into icon.{zh,en}.mdc. Anchors assert."""
BASE = 'apps/nexus/content/docs/dev/components'

DEMO_CODE = """  <template>
    <TxOsIcon platform="darwin" os="macOS 15" />
    <TxOsIcon platform="win32" os="Windows 11" />
    <TxOsIcon platform="linux" os="Ubuntu 24.04" />
  </template>"""

DEMO_ZH = f"""### TxOsIcon

用于平台标签的内联操作系统图标。

#### TxOsIcon
按 `platform` / `os` 字符串自动识别平台。
:::TuffDemoWrapper{{demo="OsIconOsIconDemo" code-lang="vue"}}
---
code: |
{DEMO_CODE}
---
:::
"""

DEMO_EN = f"""### TxOsIcon

Inline operating-system icons for platform labels.

#### TxOsIcon
Platform detection from `platform` / `os` strings.
:::TuffDemoWrapper{{demo="OsIconOsIconDemo" code-lang="vue"}}
---
code: |
{DEMO_CODE}
---
:::
"""

API_ZH = """### TxOsIcon API（简版）
::TuffPropsTable
---
rows:
  - name: platform
    type: 'string'
    default: "''"
    description: '运行时或平台标识，例如 darwin、win32、linux。'
  - name: os
    type: 'string'
    default: "''"
    description: '可读 OS 字符串，也会参与识别。'
---
::

"""

API_EN = """### TxOsIcon API (Lite)
::TuffPropsTable
---
rows:
  - name: platform
    type: 'string'
    default: "''"
    description: 'Runtime/platform identifier such as darwin, win32, or linux.'
  - name: os
    type: 'string'
    default: "''"
    description: 'Human-readable OS string used as an additional detection source.'
---
::

"""

def sub1(s, old, new, label):
    assert s.count(old) == 1, f'anchor {label}: count={s.count(old)}'
    return s.replace(old, new)

for lang in ['zh', 'en']:
    p = f'{BASE}/icon.{lang}.mdc'
    s = open(p).read()

    # 1. Demo section before 类型与来源 / Types & Sources
    head = '### 类型与来源\n' if lang == 'zh' else '### Types & Sources\n'
    s = sub1(s, head, (DEMO_ZH if lang == 'zh' else DEMO_EN) + head, 'types-sources')

    # 2. API lite section before ### Slots
    slots_head = '### Slots\n\n| 名称 |' if lang == 'zh' else '### Slots\n\n| Name |'
    s = sub1(s, slots_head, (API_ZH if lang == 'zh' else API_EN) + slots_head, 'slots')

    # 3. Events sentence
    if lang == 'zh':
        s = sub1(s, '`TuffIcon`、`TxIcon` 和 `TxStatusIcon` 不触发事件。',
                 '`TuffIcon`、`TxIcon`、`TxStatusIcon` 和 `TxOsIcon` 不触发事件。', 'events')
    else:
        s = sub1(s, '`TuffIcon`, `TxIcon`, and `TxStatusIcon` do not emit events.',
                 '`TuffIcon`, `TxIcon`, `TxStatusIcon`, and `TxOsIcon` do not emit events.', 'events')

    # 4. Rendering contract bullet
    if lang == 'zh':
        s = sub1(s, "- `status='loading' | 'error'` 会优先展示加载或错误状态。\n",
                 "- `status='loading' | 'error'` 会优先展示加载或错误状态。\n"
                 "- `TxOsIcon` 将 `platform` 与 `os` 拼接转小写后识别 macOS / Windows / Linux，未识别值回退 macOS；SVG 为 `aria-hidden`，可访问名称由外层文本承载。\n", 'contract')
    else:
        s = sub1(s, "- `status='loading' | 'error'` takes precedence over normal icon rendering.\n",
                 "- `status='loading' | 'error'` takes precedence over normal icon rendering.\n"
                 "- `TxOsIcon` concatenates and lowercases `platform` + `os` to detect macOS / Windows / Linux, falling back to the macOS glyph for unknown values; the SVGs are `aria-hidden`, so surrounding text owns the accessible name.\n", 'contract')

    # 5. Best practices bullet
    if lang == 'zh':
        s = sub1(s, '- 插件文件或自定义 SVG 传输建议在应用外壳统一注入 `TX_ICON_CONFIG_KEY`，不要在每个图标上重复传 resolver。\n',
                 '- 插件文件或自定义 SVG 传输建议在应用外壳统一注入 `TX_ICON_CONFIG_KEY`，不要在每个图标上重复传 resolver。\n'
                 '- `TxOsIcon` 在表格或列表中应搭配可见平台文本；用 CSS 字号调整大小（组件固定 `1em`），回退行为只是视觉默认值，不要当作校验结果。\n', 'practice')
    else:
        s = sub1(s, '- Inject `TX_ICON_CONFIG_KEY` once at the app shell when resolving plugin files or custom SVG transports, instead of passing resolvers to every icon.\n',
                 '- Inject `TX_ICON_CONFIG_KEY` once at the app shell when resolving plugin files or custom SVG transports, instead of passing resolvers to every icon.\n'
                 '- Pair `TxOsIcon` with visible platform text in tables or lists; size it through CSS font-size (the component uses `1em`) and treat the fallback as a visual default, not a validation signal.\n', 'practice')

    # 6. Review notes coverage
    if lang == 'zh':
        s = sub1(s, '多色 SVG 检测与状态角标尺寸。\n',
                 '多色 SVG 检测与状态角标尺寸。\n'
                 '- **实测覆盖（TxOsIcon）:** `os-icon.test.ts` 覆盖 Windows 别名、Linux 发行版别名、macOS 别名/默认回退，以及装饰性 SVG 的无障碍与 class 形态。\n', 'review')
    else:
        s = sub1(s, 'multi-color SVG detection, and status indicator sizing.\n',
                 'multi-color SVG detection, and status indicator sizing.\n'
                 '- **Verified coverage (TxOsIcon):** `os-icon.test.ts` covers Windows aliases, Linux distro aliases, macOS aliases/default fallback, and decorative SVG accessibility/class shape.\n', 'review')

    # 7. Source lines
    if lang == 'zh':
        s = sub1(s, '- Component sources: `packages/tuffex/packages/components/src/icon/src/TxIcon.vue` 与 `TxStatusIcon.vue`。',
                 '- Component sources: `packages/tuffex/packages/components/src/icon/src/TxIcon.vue`、`TxStatusIcon.vue` 与 `TxOsIcon.vue`。', 'src-components')
        s = sub1(s, '导出 `TuffIcon`、`TxIcon`、`TxStatusIcon`、`TX_ICON_CONFIG_KEY`',
                 '导出 `TuffIcon`、`TxIcon`、`TxStatusIcon`、`TxOsIcon`、`TX_ICON_CONFIG_KEY`', 'src-exports')
        s = sub1(s, '覆盖图标来源解析、SVG 颜色模式、状态渲染、注入配置与状态角标。',
                 '覆盖图标来源解析、SVG 颜色模式、状态渲染、注入配置与状态角标；`os-icon.test.ts` 覆盖平台别名识别与 macOS 回退。', 'src-coverage')
    else:
        s = sub1(s, '- Component sources: `packages/tuffex/packages/components/src/icon/src/TxIcon.vue` and `TxStatusIcon.vue`.',
                 '- Component sources: `packages/tuffex/packages/components/src/icon/src/TxIcon.vue`, `TxStatusIcon.vue`, and `TxOsIcon.vue`.', 'src-components')
        s = sub1(s, 'exports `TuffIcon`, `TxIcon`, `TxStatusIcon`, `TX_ICON_CONFIG_KEY`',
                 'exports `TuffIcon`, `TxIcon`, `TxStatusIcon`, `TxOsIcon`, `TX_ICON_CONFIG_KEY`', 'src-exports')
        s = sub1(s, 'covers icon source resolution, SVG color-mode behavior, status states, injected config, and status overlays.',
                 'covers icon source resolution, SVG color-mode behavior, status states, injected config, and status overlays; `os-icon.test.ts` covers platform alias detection and the macOS fallback.', 'src-coverage')

    open(p, 'w').write(s)
    print(p, 'merged OK')
