<template>
  <div class="FeatureCard element" @click="emit('click')">
    <div class="FeatureCard-Content">
      <div class="FeatureCard-Header flex items-start justify-between mb-4">
        <div
          class="FeatureCard-Icon w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center"
        >
          <i :class="feature.icon || 'i-ri-function-line'" class="text-white text-xl" />
        </div>
        <div
          class="FeatureCard-Badge bg-blue-500/20 text-blue-300 text-xs px-2 py-1 rounded-lg border border-blue-400/20"
        >
          {{ feature.commands.length }}
        </div>
      </div>

      <div class="FeatureCard-Body">
        <h3
          class="FeatureCard-Title text-lg font-semibold text-[var(--el-text-color-primary)] mb-2"
        >
          {{ feature.name }}
        </h3>
        <p class="FeatureCard-Desc text-sm text-[var(--el-text-color-secondary)] line-clamp-2 mb-4">
          {{ feature.desc }}
        </p>

        <div class="FeatureCard-CommandsList space-y-2">
          <div
            v-for="(command, index) in feature.commands.slice(0, 2)"
            :key="index"
            class="FeatureCard-CommandItem bg-[var(--el-fill-color-darker)] rounded-lg p-2 text-xs flex items-center justify-between"
          >
            <code class="text-yellow-300">{{ getCommandName(command) }}</code>
            <span
              v-if="getCommandShortcut(command)"
              class="text-[var(--el-text-color-placeholder)] text-xs"
            >
              {{ getCommandShortcut(command) }}
            </span>
          </div>
          <div
            v-if="feature.commands.length > 2"
            class="text-xs text-[var(--el-text-color-placeholder)] text-center py-1"
          >
            +{{ feature.commands.length - 2 }} more commands
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { IFeatureCommand } from '@talex-touch/utils/plugin'

const props = defineProps<{
  feature: any
}>()

const emit = defineEmits(['click'])

function getCommandName(command: IFeatureCommand): string {
  if (props.feature.commandsData && props.feature.commandsData[command.type]) {
    return props.feature.commandsData[command.type].name || command.type
  }
  return command.type
}

function getCommandShortcut(command: IFeatureCommand): string | undefined {
  if (props.feature.commandsData && props.feature.commandsData[command.type]) {
    return props.feature.commandsData[command.type].shortcut
  }
  return undefined
}
</script>

<style lang="scss" scoped>
.FeatureCard {
  background: var(--el-bg-color-overlay);
  backdrop-filter: blur(12px);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 1.25rem; // 20px
  padding: 1.5rem; // 24px
  cursor: pointer;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.FeatureCard-Content {
  z-index: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.FeatureCard-Body {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

.FeatureCard-Desc {
  flex-grow: 1;
  min-height: 2.5em; /* 确保至少有两行的高度 */
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
