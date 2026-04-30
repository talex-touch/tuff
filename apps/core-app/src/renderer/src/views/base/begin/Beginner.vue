<script setup lang="ts" name="Beginner">
import type { Component, Ref } from 'vue'
import { sleep } from '@talex-touch/utils/common/utils'
import { TxButton } from '@talex-touch/tuffex'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { appSetting, storageManager } from '~/modules/storage/app-storage'
import LanguageSetup from './internal/LanguageSetup.vue'

const main: Ref<HTMLElement | null> = ref(null)
const content: Ref<HTMLElement | null> = ref(null)
const component: Ref<Component | null> = ref(null)
const historyStack: Ref<Component[]> = ref([])
const { t } = useI18n()
const canBack = computed(() => historyStack.value.length > 0)

if (!appSetting.beginner) {
  appSetting.beginner = {
    init: false
  }
}

async function step(
  call: { comp: Component | null; rect?: { width: number; height: number } },
  dataAction?: (storage: unknown) => void,
  options: { pushHistory?: boolean } = { pushHistory: true }
): Promise<void> {
  if (!content.value) return

  content.value.style.opacity = '0'
  await sleep(300)

  const { comp, rect } = call
  dataAction?.(storageManager)

  if (!comp) {
    if (main.value && main.value.parentElement) {
      main.value.parentElement.style.opacity = '0'
      main.value.parentElement.style.transform = 'scale(1.05)'
      await sleep(1000)
      main.value.parentElement.style.display = 'none'
    }
    return
  }

  if (rect && main.value) {
    Object.assign(main.value.style, {
      width: `${rect.width}px`,
      height: `${rect.height}px`
    })
    await sleep(300)
  }

  if (options.pushHistory !== false && comp && component.value) {
    historyStack.value.push(component.value)
  }
  component.value = comp
  await sleep(100)

  if (content.value) {
    content.value.style.opacity = '1'
  }
}

function back(): void {
  if (!canBack.value) return
  const previous = historyStack.value.pop()
  if (!previous) return
  void step({ comp: previous }, undefined, { pushHistory: false })
}

provide('step', step)
provide('back', back)

onMounted(async () => {
  await sleep(100)

  step({
    comp: LanguageSetup
  })
})
</script>

<template>
  <div class="Beginner">
    <div ref="main" class="Beginner-Main fake-background transition-cubic">
      <div v-if="canBack" class="Beginner-TopBar">
        <TxButton variant="bare" size="small" @click="back">
          <i class="i-ri-arrow-left-line" />
          <span>{{ t('layout.back') }}</span>
        </TxButton>
      </div>
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

  &-TopBar {
    position: absolute;
    top: 1rem;
    left: 1rem;
    z-index: 2;
  }

  &-Main {
    position: absolute;
    padding: 2rem;
    width: 70%;
    height: 85%;
    left: 50%;
    top: 50%;
    animation: join 1s;
    --fake-inner-opacity: 0.98;
    box-sizing: border-box;
    transform: translate(-50%, -50%);
    backdrop-filter: saturate(180%) brightness(99%) blur(50px);
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
