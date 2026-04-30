import { defineCollection, defineContentConfig } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    docs: defineCollection({
      type: 'page',
      source: 'docs/**/*.{md,mdc}',
    }),
    app: defineCollection({
      type: 'page',
      source: 'app/**/*.md',
    }),
    guides: defineCollection({
      type: 'page',
      source: '*.md',
    }),
  },
})
