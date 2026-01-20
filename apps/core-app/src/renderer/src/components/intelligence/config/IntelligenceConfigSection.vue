<script lang="ts" name="IntelligenceConfigSection" setup>
import { ref } from 'vue'
import { TxButton } from '@talex-touch/tuffex'

defineProps<{
  title: string
  icon: string
  sectionId: string
}>()

const isCollapsed = ref(false)

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}
</script>

<template>
  <section class="aisdk-config-section mb-6" :aria-labelledby="`${sectionId}-heading`">
    <TxButton
      variant="flat"
      class="section-header flex items-center gap-2 mb-3 cursor-pointer select-none w-full text-left"
      :aria-expanded="!isCollapsed"
      :aria-controls="`${sectionId}-content`"
      @click="toggleCollapse"
    >
      <i :class="icon" class="text-lg text-[var(--el-color-primary)]" aria-hidden="true" />
      <h3
        :id="`${sectionId}-heading`"
        class="text-base font-semibold text-[var(--el-text-color-primary)]"
      >
        {{ title }}
      </h3>
      <i
        class="ml-auto text-sm text-[var(--el-text-color-secondary)] transition-transform duration-300"
        :class="[isCollapsed ? 'i-carbon-chevron-down' : 'i-carbon-chevron-up']"
        aria-hidden="true"
      />
      <span class="sr-only">
        {{ isCollapsed ? 'Expand section' : 'Collapse section' }}
      </span>
    </TxButton>

    <Transition name="collapse">
      <div
        v-show="!isCollapsed"
        :id="`${sectionId}-content`"
        class="section-content"
        role="region"
        :aria-labelledby="`${sectionId}-heading`"
      >
        <div
          class="p-4 rounded-lg border border-[var(--el-border-color-lighter)] bg-[var(--el-fill-color-blank)]"
        >
          <slot />
        </div>
      </div>
    </Transition>
  </section>
</template>

<style lang="scss" scoped>
.aisdk-config-section {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.section-header {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  padding: 0;
  border-radius: 8px;
  border: none;
  background: transparent;
  box-shadow: none;

  &:hover {
    background-color: var(--el-fill-color-light);
    transform: translateX(2px);

    i:first-child {
      transform: scale(1.1);
    }
  }

  &:active {
    transform: translateX(0);
  }

  &:focus-visible {
    outline: 3px solid var(--el-color-primary);
    outline-offset: 2px;
    background-color: var(--el-fill-color-light);
  }

  :deep(> div) {
    justify-content: flex-start;
    padding: 8px 4px;
  }

  i {
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

.section-content {
  overflow: hidden;

  > div {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);

    &:hover {
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    }
  }
}

.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  max-height: 1000px;
  opacity: 1;
}

.collapse-enter-from,
.collapse-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-10px);
}
</style>
