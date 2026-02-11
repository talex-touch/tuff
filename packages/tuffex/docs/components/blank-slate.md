# BlankSlate

A purpose-built empty state designed for first-time-use experiences. When the user encounters a feature or section for the first time and no content exists yet, BlankSlate provides a welcoming introduction with a clear call to action.

BlankSlate is built on top of `TxEmptyState` with sensible defaults for onboarding scenarios — larger sizing, vertical layout, and a clean surface — so you can focus on writing great copy rather than configuring layout props.

## Basic Usage

Provide a `title`, a `description`, and an action to guide the user toward their first step.

<DemoBlock title="BlankSlate">
<template #preview>
<div style="max-width: 520px;">
  <TxBlankSlate
    title="Create your first project"
    description="Projects help you organize your work into focused, manageable spaces. Start by creating one."
    :primary-action="{ label: 'Create Project', type: 'primary' }"
    :secondary-action="{ label: 'Learn more' }"
  />
</div>
</template>

<template #code>

```vue
<template>
  <TxBlankSlate
    title="Create your first project"
    description="Projects help you organize your work into focused, manageable spaces."
    :primary-action="{ label: 'Create Project', type: 'primary' }"
    :secondary-action="{ label: 'Learn more' }"
  />
</template>
```

</template>
</DemoBlock>

## With Custom Icon

Use the `icon` slot or the `icon` prop to set a visual that matches the context of the empty section.

<DemoBlock title="Custom Icon">
<template #preview>
<div style="max-width: 520px;">
  <TxBlankSlate
    icon="i-carbon-folder-add"
    title="No files yet"
    description="Upload or drag files here to get started."
    :primary-action="{ label: 'Upload Files', type: 'primary' }"
  />
</div>
</template>

<template #code>

```vue
<template>
  <TxBlankSlate
    icon="i-carbon-folder-add"
    title="No files yet"
    description="Upload or drag files here to get started."
    :primary-action="{ label: 'Upload Files', type: 'primary' }"
  />
</template>
```

</template>
</DemoBlock>

## Design Notes

- BlankSlate is best suited for **first-time experiences** where nothing has been created yet. For generic "no data" states, prefer `TxEmptyState` or the more specific variants (`TxNoData`, `TxSearchEmpty`).
- Keep the title short (under 8 words) and action-oriented. The description should explain *why* the user should take action, not just *what* the action does.
- A primary action is strongly recommended. The secondary action is optional and typically links to documentation or a tutorial.

## API

BlankSlate shares the full API of [`TxEmptyState`](/components/empty-state) with these default overrides:

| Override | Value |
|----------|-------|
| `size` | `'large'` |
| `layout` | `'vertical'` |
| `surface` | `'plain'` |

See [EmptyState API](/components/empty-state) for the complete list of props, events, and slots.
