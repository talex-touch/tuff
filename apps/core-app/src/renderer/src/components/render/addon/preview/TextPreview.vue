<script setup lang="ts" name="TextPreview">
import { TuffItem } from '@talex-touch/utils';
import { ref, onMounted } from 'vue';

const props = defineProps<{
  item: TuffItem
}>()

const textContent = ref('');

onMounted(async () => {
  if (props.item.meta?.file?.path) {
    const response = await fetch(props.item.meta.file.path);
    textContent.value = await response.text();
  }
});
</script>

<template>
  <div class="TextPreview">
    <pre>{{ textContent }}</pre>
  </div>
</template>

<style lang="scss" scoped>
.TextPreview {
  width: 100%;
  height: 100%;
  overflow: auto;

  pre {
    white-space: pre-wrap;
    word-wrap: break-word;
  }
}
</style>