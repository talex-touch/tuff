# FileUploader

A general-purpose file upload component with drag-and-drop support, multi-file selection, and a managed file list. FileUploader handles the complete pick-preview-remove lifecycle for any file type.

<script setup lang="ts">
import { ref } from 'vue'

const files = ref([])
</script>

## Basic Usage

Bind `v-model` to a file array. Users can click the button to browse or drag files onto the drop zone.

<DemoBlock title="File Uploader">
<template #preview>
<div style="max-width: 480px;">
  <TxFileUploader v-model="files" accept=".pdf,.png,.jpg" :max="5" />
  <p style="margin-top: 8px; font-size: 13px; color: var(--vp-c-text-2);">{{ files.length }} file(s) selected</p>
</div>
</template>

<template #code>

```vue
<script setup>
import { ref } from 'vue'
const files = ref([])
</script>

<template>
  <TxFileUploader v-model="files" accept=".pdf,.png,.jpg" :max="5" />
</template>
```

</template>
</DemoBlock>

## Design Notes

- Set `multiple` to allow batch file selection. Use `max` to cap the total number of files.
- The `accept` prop maps to the HTML `<input>` accept attribute — use MIME types or extensions (e.g., `.pdf,.docx`).
- `allowDrop` enables the drag-and-drop zone. When a user drags files over the component, it transitions to its drop state.
- Customize the button, drop zone, and hint text via `buttonText`, `dropText`, and `hintText` props.
- Call the exposed `pick()` method to programmatically open the system file chooser.

## API

### Props

<ApiSpecTable :rows="[
  { name: 'modelValue / v-model', description: 'Array of managed file objects.', type: 'FileUploaderFile[]', default: '[]' },
  { name: 'multiple', description: 'Allow selecting multiple files.', type: 'boolean', default: 'true' },
  { name: 'accept', description: 'Accepted file types (MIME or extensions).', type: 'string', default: '\"*/*\"' },
  { name: 'disabled', description: 'Disables all interaction.', type: 'boolean', default: 'false' },
  { name: 'max', description: 'Maximum number of files.', type: 'number', default: '10' },
  { name: 'showSize', description: 'Show file size in the list.', type: 'boolean', default: 'true' },
  { name: 'allowDrop', description: 'Enable drag-and-drop zone.', type: 'boolean', default: 'true' },
  { name: 'buttonText', description: 'Label for the browse button.', type: 'string', default: '\"Choose files\"' },
  { name: 'dropText', description: 'Text shown in the drop zone.', type: 'string', default: '\"Drop files here\"' },
  { name: 'hintText', description: 'Secondary hint text.', type: 'string', default: '\"or click to browse\"' },
]" />

### Events

<ApiSpecTable title="Events" :rows="[
  { name: 'change', description: 'Fires when the file list changes.', type: '(files: FileUploaderFile[]) => void' },
  { name: 'add', description: 'Fires when new files are added.', type: '(files: FileUploaderFile[]) => void' },
  { name: 'remove', description: 'Fires when a file is removed.', type: '(payload: { id: string, value: FileUploaderFile[] }) => void' },
]" />

### Exposed Methods

<ApiSpecTable title="Methods" :rows="[
  { name: 'pick()', description: 'Programmatically opens the system file chooser.' },
]" />

### FileUploaderFile Interface

<ApiSpecTable title="FileUploaderFile" :rows="[
  { name: 'id', description: 'Unique identifier.', type: 'string' },
  { name: 'name', description: 'File name.', type: 'string' },
  { name: 'size', description: 'File size in bytes.', type: 'number' },
  { name: 'type', description: 'MIME type.', type: 'string' },
  { name: 'file', description: 'The raw File object.', type: 'File' },
]" />
