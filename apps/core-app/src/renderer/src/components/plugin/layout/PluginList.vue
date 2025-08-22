<template>
  <el-scrollbar v-if="plugins" class="PluginList-Container cubic-transition">
    <div class="PluginList-Toolbox w-full">
      <div class="search-wrapper">
        <i class="i-ri-search-line search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search plugins..."
          class="search-input"
        />
        <i v-if="searchQuery" class="i-ri-close-line clear-icon" @click="searchQuery = ''" />
      </div>
    </div>

    <PluginListModule v-model="target" shrink="true" :plugins="filteredRunningPlugins">
      <template #name>Running</template>
    </PluginListModule>
    <PluginListModule v-model="target" :plugins="filteredAllPlugins">
      <template #name>All</template>
    </PluginListModule>

    <div class="PluginList-Add transition-cubic fake-background">
      <div id="newPluginBtn" class="new-plus" @click="() => emits('add-plugin')" />
    </div>
  </el-scrollbar>
</template>

<script lang="ts" name="PluginList" setup>
import { ref, computed, watch } from 'vue'
import PluginListModule from '@comp/plugin/layout/PluginListModule.vue'

const props = defineProps(['plugins'])
const emits = defineEmits(['select', 'add-plugin'])
const target = ref(-1)
const searchQuery = ref('')

const runningPlugins = computed(() =>
  props.plugins.filter((plugin) => plugin.status === 3 || plugin.status === 4)
)

// Filtered plugins based on search query
const filteredRunningPlugins = computed(() => {
  if (!searchQuery.value.trim()) {
    return runningPlugins.value
  }

  return runningPlugins.value.filter(
    (plugin) =>
      plugin.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      plugin.desc?.toLowerCase().includes(searchQuery.value.toLowerCase())
  )
})

const filteredAllPlugins = computed(() => {
  if (!searchQuery.value.trim()) {
    return props.plugins
  }

  return props.plugins.filter(
    (plugin) =>
      plugin.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      plugin.desc?.toLowerCase().includes(searchQuery.value.toLowerCase())
  )
})

watch(
  () => target.value,
  () => emits('select', target.value)
)
</script>

<style lang="scss" scoped>
.PluginList-Add {
  &:before {
    filter: invert(0.25);
    transition: 0.25s;
  }

  &:hover {
    padding: 4px 8px;
    --fake-radius: 4px;

    --fake-opacity: 0.125;
    --fake-inner-opacity: 0.125;
  }

  position: sticky;
  padding: 4px;
  display: inline-block;

  bottom: 2%;

  left: 50%;

  --fake-color: var(--el-text-color-primary);
  --fake-opacity: 0.25;
  --fake-inner-opacity: 0.25;
  --fake-radius: 50%;
  transform: translateX(-50%);
}

.PluginList-Toolbox {
  z-index: 1;
  position: sticky;
  padding: 2px 2%;

  top: 1%;

  width: 100%;
  height: 36px;

  border-radius: 8px;
  box-sizing: border-box;
}

.search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  background: var(--el-fill-color-lighter);
  border-radius: 12px;
  padding: 0 12px;
  height: 32px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid var(--el-border-color-lighter);

  &:hover {
    background: var(--el-fill-color-light);
    border-color: var(--el-border-color);
  }

  &:focus-within {
    background: var(--el-fill-color);
    border-color: var(--el-color-primary-light-5);
    box-shadow: 0 0 0 2px var(--el-color-primary-light-9);
  }
}

.search-icon {
  color: var(--el-text-color-placeholder);
  font-size: 14px;
  margin-right: 8px;
  transition: color 0.3s ease;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--el-text-color-primary);
  font-size: 13px;
  height: 100%;

  &::placeholder {
    color: var(--el-text-color-placeholder);
  }
}

.clear-icon {
  color: var(--el-text-color-placeholder);
  font-size: 14px;
  margin-left: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  border-radius: 50%;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    color: var(--el-text-color-regular);
    background: var(--el-fill-color);
  }
}

.PluginList-Container {
  position: relative;
  padding: 0 0.5rem;

  width: 100%;

  box-sizing: border-box;
}
</style>
