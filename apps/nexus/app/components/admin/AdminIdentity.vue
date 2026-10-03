<script setup lang="ts">
import { TxAvatar } from '@talex-touch/tuffex/avatar'
import { computed } from 'vue'
import { resolveAdminIdentity } from '~/utils/admin-kit'

/**
 * An account as a console row shows it: avatar, name, and the email under the
 * name. Without a name the email takes the name's place once; it is never printed
 * twice. `compact` keeps one line with a small avatar (the email moves to the
 * tooltip), so a table row stays as tall as its skeleton row.
 */
const props = withDefaults(defineProps<{
  name?: string | null
  email?: string | null
  avatar?: string | null
  /** Shown when there is neither a name nor an email, e.g. the account id. */
  fallback?: string | null
  size?: 'sm' | 'md'
  compact?: boolean
}>(), {
  size: 'md',
  compact: false,
})

const identity = computed(() => resolveAdminIdentity(props))
// Compact is a table cell: a 20px disc inside a one-line box (see the style).
const avatarSize = computed(() => {
  if (props.compact)
    return 20
  return props.size === 'sm' ? 24 : 32
})
</script>

<template>
  <div class="AdminIdentity" :class="[`is-${size}`, { 'is-compact': compact }]" :title="identity.title">
    <TxAvatar
      class="AdminIdentity-Avatar"
      :src="avatar || undefined"
      alt=""
      :name="identity.initial || undefined"
      :size="avatarSize"
    />
    <span class="AdminIdentity-Text">
      <span class="AdminIdentity-Primary">{{ identity.primary }}</span>
      <span v-if="identity.secondary && !compact" class="AdminIdentity-Secondary">{{ identity.secondary }}</span>
    </span>
  </div>
</template>

<style scoped>
.AdminIdentity {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.AdminIdentity.is-md {
  gap: 10px;
}

/* One line box tall, like every other cell in the row and like the skeleton row
   it replaces; the 20px disc overhangs that box by a fraction of a pixel rather
   than making each row taller than its placeholder. */
.AdminIdentity.is-compact {
  height: 1lh;
}

.AdminIdentity-Avatar {
  flex: none;
}

.AdminIdentity-Text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.AdminIdentity-Primary,
.AdminIdentity-Secondary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.AdminIdentity-Primary {
  color: var(--tx-text-color-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
}

.AdminIdentity.is-sm .AdminIdentity-Primary {
  font-size: 13px;
}

.AdminIdentity-Secondary {
  color: var(--tx-text-color-regular);
  font-size: 13px;
  line-height: 1.4;
}
</style>
