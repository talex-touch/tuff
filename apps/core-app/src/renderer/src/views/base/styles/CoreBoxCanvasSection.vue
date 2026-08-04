<script lang="ts" name="CoreBoxCanvasSection" setup>
import { TxButton } from '@talex-touch/tuffex/button'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import CoreBoxEditorOverlay from './editors/CoreBoxEditorOverlay.vue'

/**
 * Entry point for the CoreBox canvas editor.
 *
 * This used to live inside `LayoutSection`, which was removed together with the app-shell
 * layout switcher. CoreBox canvas customization (`appSetting.coreBoxCanvasConfig`) is a
 * separate, still-supported feature, so its entry was lifted here rather than deleted.
 */
const { t } = useI18n()

const editorVisible = ref(false)
const editorSource = ref<HTMLElement | null>(null)

function openEditor(event: MouseEvent): void {
  editorSource.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  editorVisible.value = true
}
</script>

<template>
  <TuffGroupBlock
    :name="t('layoutSection.customizeCoreBox', 'Customize CoreBox')"
    :description="t('layoutSection.customizeCoreBoxDesc', 'Adjust search box logo, input style')"
  >
    <TuffBlockSlot
      :title="t('layoutSection.customizeCoreBox', 'Customize CoreBox')"
      :description="t('layoutSection.customizeCoreBoxDesc', 'Adjust search box logo, input style')"
      default-icon="i-ri-search-line"
      active-icon="i-ri-search-fill"
      @click="openEditor"
    >
      <template #tags>
        <TxStatusBadge text="Beta" status="warning" size="sm" />
      </template>
      <TxButton variant="bare" @click="editorVisible = true">
        <span class="i-ri-edit-2-line mr-1" />
        {{ t('common.edit', 'Edit') }}
      </TxButton>
    </TuffBlockSlot>

    <CoreBoxEditorOverlay v-model="editorVisible" :source="editorSource" />
  </TuffGroupBlock>
</template>
