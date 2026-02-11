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
- Use `startIndex` to open the lightbox at a specific image programmatically.
- Each item's `name` is displayed as a caption in the lightbox viewer.
- The gallery handles keyboard navigation (arrow keys) and swipe gestures in the lightbox.

## API

### Props

<ApiSpecTable :rows="[
  { name: 'items', description: 'Array of image objects to display.', type: 'Array<{ id: string, url: string, name?: string }>' },
  { name: 'startIndex', description: 'Initial image index when opening the lightbox.', type: 'number', default: '0' },
]" />

### Events

<ApiSpecTable title="Events" :rows="[
  { name: 'open', description: 'Fires when the lightbox opens.', type: '(payload: { index: number, item: ImageGalleryItem }) => void' },
  { name: 'close', description: 'Fires when the lightbox closes.' },
]" />
