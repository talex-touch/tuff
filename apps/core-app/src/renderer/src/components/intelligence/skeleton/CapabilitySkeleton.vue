<script lang="ts" setup>
import { TxCardSkeleton } from '@talex-touch/tuffex/skeleton'

defineOptions({
  name: 'CapabilitySkeleton'
})
</script>

<template>
  <!--
    Kept as a named component so capability lists read for themselves, but the
    shape now comes from the shared preset instead of a second copy of it.
  -->
  <TxCardSkeleton />
</template>
