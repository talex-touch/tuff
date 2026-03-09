<script setup lang="ts">
const emits = defineEmits<{
  (e: 'search', query: string): void
}>()

const query = ref('')

watch(() => query.value, val => emits('search', val))
</script>

<template>
  <div :class="{ closable: query.length }" class="Searchable">
    <input v-model="query" placeholder="搜索历史记录">

    <div class="Searchable-Clear" @click="query = ''">
      <div i-carbon:close />
    </div>
  </div>
</template>

<style lang="scss">
.Searchable.closable {
  input {
    width: calc(100% - 32px - 0.75rem);
  }
  .Searchable-Clear {
    margin-left: 0.5rem;
    padding: 0.25rem;

    width: 32px;

    flex: 1;
  }
}

.Searchable {
  input {
    &:focus-within {
      outline: none;
      box-shadow: 0 0 2px 1px var(--theme-color);
    }
    position: relative;
    padding: 0.25rem 0.5rem;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    // flex: 1;
    font-size: 14px;
    font-weight: normal;

    transition: 0.25s;
    border-radius: 16px;
    background-color: #eeeeee80;
    .dark & {
      background-color: #00000080;
    }
    // background-color: var(--el-fill-color);
  }
  &-Clear {
    &:hover {
      background-color: var(--el-color-danger);
    }
    display: flex;
    margin-left: 0;
    padding: 0;

    width: 0;

    align-items: center;
    justify-content: center;

    cursor: pointer;

    font-size: 16px;
    overflow: hidden;
    transition: 0.25s;
    border-radius: 50%;
    background-color: var(--el-fill-color);
  }
  position: relative;
  display: flex;

  width: 100%;
  height: 36px;

  // overflow: hidden;
  // border-radius: 12px;
  // background-color: var(--el-fill-color);
}
</style>
