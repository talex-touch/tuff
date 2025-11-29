import { defineCollection, defineContentConfig } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    docs: defineCollection({
      type: 'page',
      source: 'docs/**/*.md',
    }),
    guides: defineCollection({
      type: 'page',
      source: '*.md',
    }),
  },
})
