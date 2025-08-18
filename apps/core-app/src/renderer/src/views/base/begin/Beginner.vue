<script setup lang="ts" name="Beginner">
import { sleep } from '@talex-touch/utils/common/utils'
import Greeting from './internal/Greeting.vue'
import { appSetting, storageManager } from '~/modules/channel/storage/index'
import { type Component, type Ref } from 'vue'
import LaunchMusic from '~/assets/sound/launch.mp3'

// Reactive references
const main: Ref<HTMLElement | null> = ref(null)
const content: Ref<HTMLElement | null> = ref(null)
const component: Ref<Component | null> = ref(null)
const last_component: Ref<Component | null> = ref(null)

// Audio element for launch sound
let audio: HTMLAudioElement | null = null

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

// Play launch sound
function playLaunchSound(): void {
  if (!audio) {
    audio = new Audio(LaunchMusic)
    audio.volume = 0.5
  }

  audio.play().catch((e) => console.log('Audio play failed:', e))
}

// Provide step and back functions to child components
provide('step', step)
provide('back', () => {
  step({
    comp: last_component.value
  })
})

// Initialize with Greeting component on mount
onMounted(async () => {
  await sleep(100)

  // Play launch sound when component mounts
  playLaunchSound()

  step({
    comp: Greeting
  })
})
</script>

<template>
  <div class="Beginner">
    <div ref="main" class="Beginner-Main fake-background transition-cubic">
      <div ref="content" class="Beginner-Content transition-cubic">
        <component :is="component" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.Beginner {
  z-index: 1000;
  position: absolute;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
  background-color: #ffffff80;

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

  &-Main {
    position: absolute;
    padding: 2rem;
    width: 70%; // Increased width for better layout
    height: 85%; // Increased height for better layout
    left: 50%;
    top: 50%;
    animation: join 1s;
    --fake-inner-opacity: 0.98;
    box-sizing: border-box;
    transform: translate(-50%, -50%);
    backdrop-filter: saturate(180%) brightness(99%) blur(50px);

    // Added max-width and max-height for better responsiveness
    max-width: 900px;
    max-height: 600px;
  }

  .dark & {
    background-color: #00000080;
  }
}

@keyframes join {
  from {
    transform: translate(-50%, -50%) scale(1.05);
  }

  to {
    transform: translate(-50%, -50%) scale(1);
  }
}
</style>
