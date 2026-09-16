<script lang="ts" name="AppIndexLaunchZoneDrawer" setup>
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { useI18n } from 'vue-i18n'
import SettingFileIndexAppIndexManager from '../settings/SettingFileIndexAppIndexManager.vue'

/**
 * The launch zone over the applications page.
 *
 * It manages which entries exist — adding a path, enabling, rebuilding — so it governs the aside
 * list rather than belonging in the detail pane, which is owned by the selected application.
 * `changed` lets the page re-read the index after a mutation closes the drawer's own refresh loop.
 */
defineProps<{ visible: boolean }>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'changed'): void
}>()

const { t } = useI18n()
</script>

<template>
  <TxDrawer
    :visible="visible"
    :title="t('settings.settingFileIndex.appIndexManagerDialogTitle')"
    size="720px"
    data-testid="app-index-launch-zone"
    @update:visible="emit('update:visible', $event)"
    @close="emit('changed')"
  >
    <div class="AppIndexLaunchZoneDrawer">
      <SettingFileIndexAppIndexManager />
    </div>
  </TxDrawer>
</template>

<style lang="scss" scoped>
.AppIndexLaunchZoneDrawer {
  padding: 1rem;
}
</style>
