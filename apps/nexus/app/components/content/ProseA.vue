<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import {
  isDocsPath,
  resolveDocsLocaleFromRoute,
  toLocalizedDocsPath,
} from '#shared/utils/docs-path'

const props = withDefaults(defineProps<{
  href?: string
  target?: string
}>(), {
  href: '',
  target: undefined,
})

const attrs = useAttrs()
const route = useRoute()

function splitHrefSuffix(href: string) {
  const match = href.match(/^([^?#]*)([?#].*)?$/)
  return {
    path: match?.[1] ?? href,
    suffix: match?.[2] ?? '',
  }
}

const resolvedHref = computed(() => {
  if (!props.href)
    return props.href

  const { path, suffix } = splitHrefSuffix(props.href)
  if (!isDocsPath(path))
    return props.href

  const locale = resolveDocsLocaleFromRoute(route.path)
  return `${toLocalizedDocsPath(path, locale)}${suffix}`
})
</script>

<template>
  <NuxtLink
    v-bind="attrs"
    :href="resolvedHref"
    :target="target"
  >
    <slot />
  </NuxtLink>
</template>
