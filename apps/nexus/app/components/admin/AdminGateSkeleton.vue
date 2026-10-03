<script setup lang="ts">
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import AdminSection from '~/components/admin/AdminSection.vue'

/**
 * The console's placeholder page: a heading bar where `AdminPageShell` puts its
 * title, then two blocks in the `AdminSection` card. Drawn by `layouts/admin.vue`
 * while the administrator gate resolves and while a route change is in flight,
 * so the main column is never blank.
 */
</script>

<template>
  <div class="AdminGateSkeleton" aria-hidden="true">
    <div class="AdminGateSkeleton-Heading">
      <TxSkeleton :width="168" :height="20" :radius="8" />
    </div>
    <AdminSection>
      <div class="AdminGateSkeleton-Block">
        <TxSkeleton width="32%" :height="14" :radius="6" />
        <TxSkeleton :lines="3" :height="12" :gap="12" />
      </div>
    </AdminSection>
    <AdminSection>
      <div class="AdminGateSkeleton-Block">
        <TxSkeleton width="24%" :height="14" :radius="6" />
        <TxSkeleton :lines="6" :height="12" :gap="14" />
      </div>
    </AdminSection>
  </div>
</template>

<style scoped>
/* Same rhythm as AdminPageShell: 16px between the heading and each block. */
.AdminGateSkeleton {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

/* The heading's line box: 20px type at line-height 1.4. */
.AdminGateSkeleton-Heading {
  display: flex;
  align-items: center;
  height: 28px;
}

.AdminGateSkeleton-Block {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
