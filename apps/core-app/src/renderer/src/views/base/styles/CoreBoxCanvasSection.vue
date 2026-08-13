<script lang="ts" name="CoreBoxCanvasSection" setup>
import { TxButton } from '@talex-touch/tuffex/button'
import { TxTag } from '@talex-touch/tuffex/tag'
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
  <TuffGroupBlock :name="t('layoutSection.coreBoxGroup')">
    <TuffBlockSlot
      :title="t('layoutSection.customizeCoreBox', 'Customize CoreBox')"
      :description="t('layoutSection.customizeCoreBoxDesc', 'Adjust search box logo, input style')"
      @click="openEditor"
    >
      <template #tags>
        <TxTag
          label="Beta"
          size="sm"
          color="var(--shell-text-muted)"
          background="var(--shell-surface-2)"
          border="transparent"
        />
      </template>
      <TxButton variant="bare" class="CoreBoxCanvasSection-Edit" @click="editorVisible = true">
        <span class="i-ri-edit-2-line" />
        {{ t('common.edit', 'Edit') }}
      </TxButton>
    </TuffBlockSlot>

    <CoreBoxEditorOverlay v-model="editorVisible" :source="editorSource" />
  </TuffGroupBlock>
</template>

<style lang="scss" scoped>
/** Artboard `E0C1Zz` · `Btn 编辑`: hairline-outlined, not a filled or accented button. */
.CoreBoxCanvasSection-Edit {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--shell-border-strong);
  border-radius: var(--shell-radius-sm);
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-sm);
  font-weight: 500;
}
</style>
