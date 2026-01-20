<script lang="ts" setup>
interface Props {
  active: boolean
  link?: string
  list?: number
}

const props = withDefaults(defineProps<Props>(), {
  link: undefined,
  list: 0,
})

const emit = defineEmits<{
  (e: 'click'): void
}>()

const linkable = computed(() => props.list <= 0)
</script>

<template>
  <div class="DocSection flex flex-col">
    <NuxtLink
      v-if="linkable"
      :to="link"
      class="DocSection-Header group w-full flex cursor-pointer items-center py-1 text-[12.5px] font-normal transition-colors no-underline"
      :class="active
        ? 'text-black dark:text-white'
        : 'text-black/50 hover:text-black/70 dark:text-white/50 dark:hover:text-white/70'"
      @click="emit('click')"
    >
      <span class="truncate">
        <slot name="header" />
      </span>
    </NuxtLink>
    <button
      v-else
      type="button"
      class="DocSection-Header group w-full flex cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-[10.5px] font-semibold tracking-wider uppercase transition-all duration-150 bg-black/[0.04] dark:bg-white/[0.06]"
      :class="active
        ? 'text-black/70 dark:text-white/75 bg-black/[0.06] dark:bg-white/[0.12]'
        : 'text-black/45 hover:text-black/60 dark:text-white/45 dark:hover:text-white/60'"
      :aria-expanded="active"
      @click="emit('click')"
    >
      <span class="truncate">
        <slot name="header" />
      </span>
      <span
        class="i-carbon-chevron-down text-[9px] transition-transform duration-200"
        :class="active ? '' : '-rotate-90'"
      />
    </button>

    <div
      class="grid transition-[grid-template-rows] duration-200 ease-out"
      :style="{ gridTemplateRows: active && list > 0 ? '1fr' : '0fr' }"
    >
      <div class="overflow-hidden">
        <ul class="m-0 flex flex-col list-none gap-0.5 py-1 pl-0.5">
          <slot />
        </ul>
      </div>
    </div>
  </div>
</template>
