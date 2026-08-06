<script lang="ts" setup>
import { TxListItemSkeleton } from '@talex-touch/tuffex/skeleton'

defineOptions({
  name: 'ProviderSkeleton'
})
</script>

<template>
  <!--
    Kept as a named component so provider lists read for themselves, but the
    shape now comes from the shared preset instead of a second copy of it.
  -->
  <TxListItemSkeleton />
</template>
