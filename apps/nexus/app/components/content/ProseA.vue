<script setup lang="ts">
import { computed, inject, useAttrs } from 'vue'
import {
  isDocsPath,
  resolveDocsLocaleFromRoute,
  resolveDocsSourceLinkHref,
  toLocalizedDocsPath,
} from '#shared/utils/docs-path'
import { DOCS_SOURCE_PATH_KEY } from '~/utils/docs-source-path'

const props = withDefaults(defineProps<{
  href?: string
  target?: string
}>(), {
  href: '',
  target: undefined,
})

const attrs = useAttrs()
const route = useRoute()
// The document being rendered, for links written against the content tree.
const sourcePath = inject(DOCS_SOURCE_PATH_KEY, null)

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

  const locale = resolveDocsLocaleFromRoute(route.path)
  const sourceLink = resolveDocsSourceLinkHref(props.href, sourcePath?.value, locale)
  if (sourceLink)
    return sourceLink

  const { path, suffix } = splitHrefSuffix(props.href)
  if (!isDocsPath(path))
    return props.href

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
