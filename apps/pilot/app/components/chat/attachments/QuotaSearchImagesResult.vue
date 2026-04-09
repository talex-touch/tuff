<script setup lang="ts">
import QueryCollapse from '../QueryCollapse.vue'

const props = defineProps<{
  data: any
}>()
</script>

<template>
  <div class="QuotaSearchResult">
    <ChatQueryCollapse>
      <template #Header>
        <div i-carbon-link />
        参考
        <span class="text-query">
          {{ data._.input.input }}
        </span>
        <span class="text-primary">({{
          data.results.length
        }})</span>
      </template>
      <span
        v-for="(item, index) in data.results"
        :key="item.href"
        :style="`--i: ${(Number(index) + 1) * 0.125}s`"
        class="ChatItem-ReferenceList"
      >
        <a target="_blank" :href="item.href">{{
          item.title
        }}</a>
      </span>
    </ChatQueryCollapse>
  </div>
</template>

<style lang="scss">
.text-query {
  opacity: 0.75;
}

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
      opacity: 0.75;
    }
    opacity: 0.5;

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
  &:hover {
    opacity: 0.5;
  }
  position: relative;
  padding: 0.25rem 0.5rem;

  width: max-content;
  height: max-content;
  max-width: 100%;

  opacity: 0.25;
  font-size: 14px;
  // border-radius: 12px;
  // border: 1px solid var(--el-border-color);
}
</style>
