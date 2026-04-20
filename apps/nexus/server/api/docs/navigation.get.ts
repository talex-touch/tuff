import { queryCollectionNavigation } from '@nuxt/content/server'

function toPlainJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export default defineEventHandler(async (event) => {
  const navigation = await queryCollectionNavigation(event, 'docs')

  setHeader(event, 'cache-control', 'public, max-age=300, stale-while-revalidate=3600')

  return toPlainJson(Array.isArray(navigation) ? navigation : [])
})
