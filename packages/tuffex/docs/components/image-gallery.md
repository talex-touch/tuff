# ImageGallery

A responsive image grid with built-in lightbox preview. Click any thumbnail to open a full-size modal viewer with navigation controls.

<script setup lang="ts">
const items = [
  { id: 'a', url: 'https://picsum.photos/seed/a/640/420', name: 'Mountain Lake' },
  { id: 'b', url: 'https://picsum.photos/seed/b/640/420', name: 'Forest Trail' },
  { id: 'c', url: 'https://picsum.photos/seed/c/640/420', name: 'Coastal Sunset' },
  { id: 'd', url: 'https://picsum.photos/seed/d/640/420', name: 'City Lights' },
]
</script>

## Basic Usage

Pass an `items` array where each item provides an `id`, `url`, and optional `name`.

<DemoBlock title="Image Gallery">
<template #preview>
<div style="width: 560px;">
  <TxImageGallery :items="items" />
</div>
</template>

<template #code>

```vue
<script setup>
const items = [
  { id: 'a', url: 'https://picsum.photos/seed/a/640/420', name: 'Mountain Lake' },
  { id: 'b', url: 'https://picsum.photos/seed/b/640/420', name: 'Forest Trail' },
  { id: 'c', url: 'https://picsum.photos/seed/c/640/420', name: 'Coastal Sunset' },
]
</script>

<template>
  <TxImageGallery :items="items" />
</template>
```

</template>
</DemoBlock>

## Design Notes

- Thumbnails are displayed in a responsive grid. Clicking a thumbnail opens the lightbox modal at that index.
- Use `startIndex` to control the current preview index. Out-of-range values are clamped to the available image list.
- Each item's `name` is used for the modal title and image alt text. Unnamed images keep empty alt text.
- Empty `items` render no thumbnails and do not open the modal or emit `open`.
- The preview uses `TxModal`, so it inherits dialog semantics, title linkage, close button, backdrop close, Escape close, and focus restoration.
- Footer Prev / Next controls are disabled at the first and last images.

## API

### Props

<ApiSpecTable :rows="[
  { name: 'items', description: 'Array of image objects to display.', type: 'Array<{ id: string, url: string, name?: string }>' },
  { name: 'startIndex', description: 'Current preview index. Values outside the list bounds are clamped.', type: 'number', default: '0' },
]" />

### Events

<ApiSpecTable title="Events" :rows="[
  { name: 'open', description: 'Fires after a thumbnail opens the lightbox.', type: '(payload: { index: number, item: ImageGalleryItem }) => void' },
  { name: 'close', description: 'Fires when the lightbox closes.', type: '() => void' },
]" />
