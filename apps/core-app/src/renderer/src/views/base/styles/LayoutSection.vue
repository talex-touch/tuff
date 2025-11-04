<template>
  <div ref="wrapperRef" class="LayoutSection-Wrapper fake-background">
    <p font-600 text-lg>{{ t('layoutSection.title', 'Layout Selection') }}</p>
    <div
      ref="scrollContainer"
      class="LayoutSection-Container"
      @scroll="handleScroll"
    >
      <div
        v-for="(layout, key) in availableLayouts"
        :key="key"
        :class="{ active: currentLayoutName === key }"
        class="LayoutSection-Item transition-cubic"
        @click="handleLayoutSelect(key)"
      >
        <div class="LayoutSection-Item-Preview">
          <div class="LayoutSection-Item-Preview-Content">
            <!-- Layout preview placeholder -->
            <div class="LayoutSection-Item-Preview-Window">
              <div class="LayoutSection-Item-Preview-Header" />
              <div class="LayoutSection-Item-Preview-Body">
                <div class="LayoutSection-Item-Preview-Sidebar" />
                <div class="LayoutSection-Item-Preview-Main" />
              </div>
            </div>
          </div>
        </div>
        <div class="LayoutSection-Item-Bar fake-background">
          <span>{{ layout.displayName }}</span>
        </div>
      </div>
    </div>
    <p ref="tipRef" class="LayoutSection-Tip" />
  </div>
</template>

<script lang="ts" name="LayoutSection" setup>
import { useI18n } from 'vue-i18n'
import { useDynamicTuffLayout } from '~/modules/layout'

const { t } = useI18n()

const { currentLayoutName, availableLayouts, switchLayout } = useDynamicTuffLayout()

const wrapperRef = ref<HTMLElement | null>(null)
const scrollContainer = ref<HTMLElement | null>(null)
const tipRef = ref<HTMLElement | null>(null)

/**
 * Handle layout selection
 */
async function handleLayoutSelect(layoutName: string): Promise<void> {
  console.log('[LayoutSection] handleLayoutSelect called:', {
    layoutName,
    currentLayoutName: currentLayoutName.value,
    isSame: layoutName === currentLayoutName.value
  })

  if (layoutName === currentLayoutName.value) {
    console.log('[LayoutSection] Same layout selected, skipping')
    return
  }

  try {
    console.log('[LayoutSection] Calling switchLayout:', layoutName)
    await switchLayout(layoutName)
    const layoutConfig = availableLayouts.value[layoutName]
    
    console.log('[LayoutSection] Layout switch completed:', {
      layoutName,
      layoutConfig,
      currentLayoutName: currentLayoutName.value
    })
    
    updateTip(
      t('layoutSection.selected', `Selected: ${layoutConfig?.displayName || layoutName}`)
    )
  } catch (error) {
    console.error('[LayoutSection] Failed to switch layout:', error)
    updateTip(t('layoutSection.error', 'Failed to switch layout'))
  }
}

/**
 * Update tip text
 */
function updateTip(text: string): void {
  if (!tipRef.value) return

  tipRef.value.textContent = text
  tipRef.value.style.opacity = '1'

  setTimeout(() => {
    if (tipRef.value) {
      tipRef.value.style.opacity = '0'
    }
  }, 2000)
}

/**
 * Handle scroll event
 */
function handleScroll(): void {
  // Can be used for scroll effects if needed
}

onMounted(() => {
  if (tipRef.value) {
    tipRef.value.textContent = t('layoutSection.tip', 'Select a layout to switch')
  }
})
</script>

<style lang="scss" scoped>
.LayoutSection-Wrapper {
  margin: 1rem 0;
  padding: 0.5rem;

  --fake-inner-opacity: 0.5;
  --fake-radius: 12px;
  --fake-color: var(--el-fill-color-dark);

  & > p {
    margin: 0.5rem 0.25rem;
  }
}

.LayoutSection-Container {
  position: relative;
  padding: 1rem 0;

  display: flex;
  gap: 1rem;

  width: 100%;
  height: 12rem;

  overflow-x: auto;
  overflow-y: hidden;
  scroll-behavior: smooth;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;

  /* Custom scrollbar */
  &::-webkit-scrollbar {
    height: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--el-border-color);
    border-radius: 3px;

    &:hover {
      background: var(--el-border-color-darker);
    }
  }
}

.LayoutSection-Item {
  position: relative;

  flex: 0 0 auto;
  width: 200px;
  height: 100%;

  cursor: pointer;
  border-radius: 12px;
  border: 2px solid var(--el-border-color);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  scroll-snap-align: start;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border-color: var(--el-border-color-darker);
  }

  &.active {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 2px var(--el-color-primary-light-5),
      0 4px 12px rgba(0, 0, 0, 0.15);

    .LayoutSection-Item-Bar {
      background: var(--el-color-primary-light-9);
    }
  }
}

.LayoutSection-Item-Preview {
  position: relative;

  width: 100%;
  height: calc(100% - 2.5rem);

  overflow: hidden;
  border-radius: 12px 12px 0 0;
}

.LayoutSection-Item-Preview-Content {
  position: relative;

  width: 100%;
  height: 100%;

  background: var(--el-bg-color-page);
}

.LayoutSection-Item-Preview-Window {
  position: relative;

  width: 100%;
  height: 100%;

  display: flex;
  flex-direction: column;

  border-radius: 8px;
  overflow: hidden;
}

.LayoutSection-Item-Preview-Header {
  height: 32px;

  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color);
}

.LayoutSection-Item-Preview-Body {
  flex: 1;

  display: flex;

  background: var(--el-bg-color-page);
}

.LayoutSection-Item-Preview-Sidebar {
  width: 40px;

  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color);
}

.LayoutSection-Item-Preview-Main {
  flex: 1;

  background: var(--el-bg-color-page);
}

.LayoutSection-Item-Bar {
  position: absolute;
  bottom: 0;

  display: flex;
  align-items: center;
  justify-content: center;

  width: 100%;
  height: 2.5rem;

  --fake-radius: 0 0 12px 12px;

  span {
    font-weight: 500;
    font-size: 0.875rem;
    color: var(--el-text-color-primary);
  }
}

.LayoutSection-Tip {
  margin: 0.5rem 0.25rem 0;
  padding: 0.25rem 0.5rem;

  opacity: 0;
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
  transition: opacity 0.3s ease;
}
</style>

