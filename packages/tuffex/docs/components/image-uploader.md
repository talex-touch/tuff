# ImageUploader

A drag-and-drop image picker with inline previews and remove controls. ImageUploader manages the full selection lifecycle — picking files, generating previews, and emitting structured file objects.

<script setup lang="ts">
import { ref } from 'vue'

const files = ref([])
</script>

## Basic Usage

Bind `v-model` to a file array. Users can click to browse or drag images onto the drop zone.

<DemoBlock title="Image Uploader">
<template #preview>
<div style="width: 560px;">
  <TxImageUploader v-model="files" />
  <p style="margin-top: 8px; font-size: 13px; color: var(--vp-c-text-2);">Selected: {{ files.length }} file(s)</p>
</div>
</template>

<template #code>

```vue
<script setup>
import { ref } from 'vue'
const files = ref([])
</script>

<template>
  <TxImageUploader v-model="files" />
</template>
```

</template>
</DemoBlock>

## Design Notes

- Each selected image generates an inline thumbnail preview with a remove button.
- Set `multiple` to allow selecting more than one image at a time. Use `max` to cap the total.
- The `accept` prop maps directly to the HTML file input's `accept` attribute — default is image types.
- File objects in the model include `id`, `url` (object URL for preview), `name`, and the raw `File` reference.

## API

### Props

<ApiSpecTable :rows="[
  { name: 'modelValue / v-model', description: 'Array of selected image file objects.', type: 'ImageUploaderFile[]' },
  { name: 'multiple', description: 'Allow selecting multiple files at once.', type: 'boolean', default: 'false' },
  { name: 'accept', description: 'Accepted file types (HTML accept attribute).', type: 'string', default: '\"image/*\"' },
  { name: 'disabled', description: 'Disables file selection and remove controls.', type: 'boolean', default: 'false' },
  { name: 'max', description: 'Maximum number of files allowed.', type: 'number' },
]" />

### Events

<ApiSpecTable title="Events" :rows="[
  { name: 'change', description: 'Fires when the file list changes.', type: '(files: ImageUploaderFile[]) => void' },
  { name: 'remove', description: 'Fires when a file is removed.', type: '(payload: { id: string, value: ImageUploaderFile[] }) => void' },
]" />
