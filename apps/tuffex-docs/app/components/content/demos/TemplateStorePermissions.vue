<script lang="ts">
import type { StatusTone } from '@talex-touch/tuffex/status-badge'
import type { PropType } from 'vue'

// One permission row as the Store template shows it: in the detail's
// Permissions tab and inside the install / update confirmations. The store
// resolves names, reasons and risk from the manifest and the permission
// registry; this only lays them out.
export interface StorePermissionRow {
  id: string
  name: string
  reason: string
  icon: string
  risk: string
  tone: StatusTone
  riskIcon: string
  /** Required / Optional; empty hides the tag. */
  tag: string
  /** Extra line under the reason, e.g. "asked when needed". */
  note: string
}
</script>

<script setup lang="ts">
defineProps({
  rows: { type: Array as PropType<StorePermissionRow[]>, required: true },
  /** Inside a dialog: tighter rows and no permission id. */
  compact: { type: Boolean, default: false },
})
</script>

<template>
  <ul class="store-perms" :class="{ 'is-compact': compact }">
    <li v-for="row in rows" :key="row.id" class="store-perm">
      <span class="store-perm__icon" aria-hidden="true"><span :class="row.icon" /></span>
      <div class="store-perm__text">
        <span class="store-perm__name">
          {{ row.name }}
          <code v-if="!compact" class="store-perm__id">{{ row.id }}</code>
        </span>
        <span class="store-perm__reason">{{ row.reason }}</span>
        <span v-if="row.note" class="store-perm__note">{{ row.note }}</span>
      </div>
      <div class="store-perm__meta">
        <TxStatusBadge :text="row.risk" :status="row.tone" :icon="row.riskIcon" size="sm" />
        <TxTag v-if="row.tag" :label="row.tag" size="sm" variant="plain" />
      </div>
    </li>
  </ul>
</template>

<style scoped>
/* Rendered in the template and in teleported dialogs: only --tx-* tokens. */
.store-perms {
  display: flex;
  margin: 0;
  padding: 0;
  flex-direction: column;
  gap: 2px;
  list-style: none;
}

.store-perm {
  display: grid;
  align-items: start;
  gap: 4px 12px;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  padding: 10px 4px;
  border-bottom: 1px solid var(--tx-border-color-lighter, #ebeef5);
}

.store-perm:last-child {
  border-bottom: 0;
}

.store-perms.is-compact .store-perm {
  padding: 8px 0;
}

.store-perm__icon {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-regular, #606266);
  font-size: 15px;
}

.store-perm__text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.store-perm__name {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 8px;
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
}

.store-perm__id {
  color: var(--tx-text-color-secondary, #909399);
  font-family: var(--tx-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  font-weight: 400;
}

.store-perm__reason {
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
  line-height: 1.55;
}

.store-perm__note {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.store-perm__meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

@container template (max-width: 639px) {
  .store-perm {
    grid-template-columns: 30px minmax(0, 1fr);
  }

  .store-perm__meta {
    flex-direction: row;
    align-items: center;
    grid-column: 2;
  }
}
</style>
