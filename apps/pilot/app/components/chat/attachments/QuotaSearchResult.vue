<script setup lang="ts">
const props = defineProps<{
  data: any
  value: any
}>()

const obj = computed(() => JSON.parse(props.value))
</script>

<template>
  <div class="QuotaSearchResult">
    <span
      v-for="(item, index) in obj.results"
      :key="item.href"
      :style="`--i: ${(index + 1) * 0.125}s`"
      class="ChatItem-ReferenceList"
    >
      <a target="_blank" :href="item.href">{{
        item.title
      }}</a>
    </span>
  </div>
</template>

<style lang="scss" scoped>
@keyframes reference-join {
  from {
    opacity: 0;
    transform: translateY(10%);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.ChatItem-ReferenceList {
  display: flex;
  flex-direction: column;

  gap: 0.25rem;
  a {
    &:hover {
      opacity: 1;
    }
    opacity: 0.75;

    cursor: pointer;
  }

  opacity: 0;
  animation: 0.25s var(--i) cubic-bezier(0.075, 0.82, 0.165, 1) reference-join
    forwards;

  a {
    display: inline;

    white-space: pre-wrap;
    word-break: break-all;
    word-wrap: break-word;
    overflow-wrap: break-word;

    // max-width: 50%;
  }

  .mobile & {
    margin: 0.25rem 0;
  }
}

.QuotaSearchResult {
  position: relative;
  padding: 0.25rem 0.5rem;

  width: max-content;
  height: max-content;
  max-width: 100%;

  opacity: 0.75;
  font-size: 14px;
  // border-radius: 12px;
  // border: 1px solid var(--el-border-color);
}
</style>
