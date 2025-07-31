<!--
  Beginner Component

  Handles the initial setup wizard for new users.
-->
<script setup lang="ts" name="Beginner">
import { sleep } from '@talex-touch/utils/common/utils'
import Greeting from './internal/Greeting.vue'
import { appSetting, storageManager } from '~/modules/channel/storage/index'
import { type Component, type Ref } from 'vue'

// Reactive references
const main: Ref<HTMLElement | null> = ref(null)
const content: Ref<HTMLElement | null> = ref(null)
const component: Ref<Component | null> = ref(null)
const last_component: Ref<Component | null> = ref(null)

// Initialize appSetting.beginner if it doesn't exist
if (!appSetting.beginner) {
  appSetting.beginner = {
    init: false
  }
}

/**
 * Step through the setup wizard
 * @param call - Object containing component and optional rectangle dimensions
 * @param dataAction - Optional function to perform data actions
 */
async function step(
  call: { comp: Component | null; rect?: { width: number; height: number } },
  dataAction?: (storageManager: any) => void
): Promise<void> {
  if (!content.value) return

  content.value.style.opacity = '0'
  await sleep(300)

  const { comp, rect } = call
  dataAction?.(storageManager)

  // Handle completion case
  if (!comp) {
    if (main.value && main.value.parentElement) {
      main.value.parentElement.style.opacity = '0'
      main.value.parentElement.style.transform = 'scale(1.05)'
      await sleep(1000)
      main.value.parentElement.style.display = 'none'
    }
    return
  }

  // Adjust size if rectangle dimensions are provided
  if (rect && main.value) {
    Object.assign(main.value.style, {
      width: `${rect.width}px`,
      height: `${rect.height}px`
    })
    await sleep(300)
  }

  // Update component
  last_component.value = component.value
  component.value = comp
  await sleep(100)

  if (content.value) {
    content.value.style.opacity = '1'
  }
}

// Provide step and back functions to child components
provide('step', step)
provide('back', () => {
  step({
    comp: last_component.value
  })
})

// Initialize with Greeting component on mount
onMounted(() => {
  step({
    comp: Greeting
  })
})
</script>

<!--
  Beginner Component Template

  Displays the setup wizard with dynamic content.
-->
<template>
  <!-- Main container for the beginner setup wizard -->
  <div class="Beginner">
    <!-- Main content area with background effect -->
    <div ref="main" class="Beginner-Main fake-background transition-cubic">
      <!-- Content container with transition effect -->
      <div ref="content" class="Beginner-Content transition-cubic">
        <!-- Dynamic component rendering -->
        <component :is="component" />
      </div>
    </div>
  </div>
</template>

<!--
  Beginner Component Styles

  SCSS styles for the beginner setup wizard including animations and responsive design.
-->
<style lang="scss" scoped>
/** Main container styles */
.Beginner {
  z-index: 1000;
  position: absolute;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
  background-color: #ffffff80;

  /** Content area styles */
  &-Content {
    position: absolute;
    padding: 2rem;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border-radius: 8px;
    box-sizing: border-box;
  }

  /** Main area styles */
  &-Main {
    position: absolute;
    padding: 2rem;
    width: 60%;
    height: 80%;
    left: 50%;
    top: 50%;
    animation: join 1s;
    --fake-inner-opacity: 0.98;
    box-sizing: border-box;
    transform: translate(-50%, -50%);
    backdrop-filter: saturate(180%) brightness(99%) blur(50px);
  }

  /** Dark mode styles */
  .dark & {
    background-color: #00000080;
  }
}

/** Join animation keyframes */
@keyframes join {
  from {
    transform: translate(-50%, -50%) scale(1.05);
  }

  to {
    transform: translate(-50%, -50%) scale(1);
  }
}
</style>
