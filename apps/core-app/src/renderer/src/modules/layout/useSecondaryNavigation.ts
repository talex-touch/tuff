import type { RouteLocationRaw, RouteRecordRaw } from 'vue-router'
import { computed, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'

type RouteRecordTree = RouteRecordRaw & { children?: RouteRecordTree[] }

interface ParentLookupResult {
  parent: RouteRecordTree
  child: RouteRecordTree
  parentPath: string
  childPath: string
}

interface FlattenedRouteEntry {
  record: RouteRecordTree
  absolutePath: string
  depth: number
}

/**
 * Normalizes route paths by collapsing duplicate slashes and removing trailing slash.
 */
function normalizePath(path?: string | null): string {
  if (!path || path === '/')
    return '/'
  return path.replace(/\/+$/, '') || '/'
}

/**
 * Joins base and segment paths, respecting leading/trailing slashes.
 */
function joinPaths(basePath: string, segment: string): string {
  if (!segment) {
    return basePath || '/'
  }

  if (segment.startsWith('/')) {
    const normalized = segment.replace(/^\/+/, '/')
    return normalized === '' ? '/' : normalized
  }

  if (!basePath || basePath === '/') {
    return `/${segment}`.replace(/\/+/g, '/')
  }

  return `${basePath.replace(/\/+$/, '')}/${segment}`.replace(/\/+/g, '/')
}

/**
 * Flattens a nested route tree into absolute paths with depth info.
 */
function flattenRouteTree(records: RouteRecordTree[], parentAbsolutePath = '', depth = 0): FlattenedRouteEntry[] {
  const entries: FlattenedRouteEntry[] = []

  for (const record of records) {
    const absolutePath = joinPaths(parentAbsolutePath, record.path ?? '')
    entries.push({
      record,
      absolutePath,
      depth,
    })

    if (record.children?.length) {
      entries.push(
        ...flattenRouteTree((record.children as RouteRecordTree[]) ?? [], absolutePath, depth + 1),
      )
    }
  }

  return entries
}

/**
 * Attempts to find the declared parent route using the router options tree.
 */
function findParentRouteInTree(records: RouteRecordTree[], targetName: RouteRecordRaw['name'] | null | undefined, targetPath: string, parentAbsolutePath = ''): ParentLookupResult | null {
  for (const record of records) {
    const absoluteRecordPath = joinPaths(parentAbsolutePath, record.path ?? '')
    const children = (record.children ?? []) as RouteRecordTree[]

    for (const child of children) {
      const absoluteChildPath = joinPaths(absoluteRecordPath, child.path ?? '')
      const matchesByName
        = targetName != null && child.name != null && targetName === child.name
      const matchesByPath = normalizePath(absoluteChildPath) === normalizePath(targetPath)

      if (matchesByName || matchesByPath) {
        return {
          parent: record,
          child,
          parentPath: normalizePath(absoluteRecordPath),
          childPath: normalizePath(absoluteChildPath),
        }
      }

      const nested = findParentRouteInTree(
        (child.children ?? []) as RouteRecordTree[],
        targetName,
        targetPath,
        absoluteChildPath,
      )

      if (nested) {
        return nested
      }
    }
  }

  return null
}

/**
 * Finds the nearest ancestor based on shared path prefixes.
 */
function findParentByPathPrefix(flattenedRoutes: FlattenedRouteEntry[], targetPath: string): { parent: RouteRecordTree, parentPath: string } | null {
  const normalizedTarget = normalizePath(targetPath)
  if (normalizedTarget === '/' || normalizedTarget === '')
    return null

  let bestMatch: { entry: FlattenedRouteEntry, normalizedPath: string } | null = null

  for (const entry of flattenedRoutes) {
    const normalizedParent = normalizePath(entry.absolutePath)

    if (!normalizedParent || normalizedParent === '/' || normalizedParent === normalizedTarget) {
      continue
    }

    const prefix = `${normalizedParent}/`
    if (!normalizedTarget.startsWith(prefix)) {
      continue
    }

    if (!bestMatch || normalizedParent.length > bestMatch.normalizedPath.length) {
      bestMatch = {
        entry,
        normalizedPath: normalizedParent,
      }
    }
  }

  if (!bestMatch)
    return null

  return {
    parent: bestMatch.entry.record,
    parentPath: normalizePath(bestMatch.entry.absolutePath),
  }
}

interface UseSecondaryNavigationOptions {
  debugLabel?: string
}

/**
 * Provides parent route detection and back navigation for secondary layouts.
 */
export function useSecondaryNavigation(options?: UseSecondaryNavigationOptions) {
  const route = useRoute()
  const router = useRouter()

  const routeRecords = computed(
    () => ((router.options.routes ?? []) as RouteRecordTree[]) ?? ([] as RouteRecordTree[]),
  )

  const flattenedRoutes = computed(() => flattenRouteTree(routeRecords.value))

  const parentLookupFromRoutes = computed(() =>
    findParentRouteInTree(routeRecords.value, route.name, route.path),
  )

  const parentByPrefix = computed(() =>
    findParentByPathPrefix(flattenedRoutes.value, route.path),
  )

  const parentRouteRecord = computed(() => {
    const matched = route.matched
    if (!matched || matched.length < 2)
      return null
    const candidate = matched[matched.length - 2]
    return candidate.children?.length ? candidate : null
  })

  const parentRouteTarget = computed<RouteLocationRaw | null>(() => {
    const resolvedParent
      = parentLookupFromRoutes.value
        ?? (parentByPrefix.value
          ? {
              parent: parentByPrefix.value.parent,
              parentPath: parentByPrefix.value.parentPath,
              child: {} as RouteRecordTree,
              childPath: normalizePath(route.path),
            }
          : null)

    if (resolvedParent?.parent) {
      if (resolvedParent.parent.name) {
        return {
          name: resolvedParent.parent.name,
          params: route.params,
          query: route.query,
        }
      }

      return {
        path: resolvedParent.parentPath,
      }
    }

    const fallbackParent = parentRouteRecord.value
    if (fallbackParent) {
      if (fallbackParent.name) {
        return {
          name: fallbackParent.name,
          params: route.params,
          query: route.query,
        }
      }

      return {
        path: fallbackParent.path,
      }
    }

    return null
  })

  const canNavigateBack = computed(() => Boolean(parentRouteTarget.value))

  const navigateBack = (): void => {
    const target = parentRouteTarget.value
    if (!target)
      return
    void router.push(target)
  }

  const isDebugEnabled = (): boolean => {
    if (typeof window !== 'undefined' && (window as any).__TALEX_SECONDARY_NAV_DEBUG__) {
      return true
    }

    const metaEnv
      = typeof import.meta !== 'undefined' && (import.meta as any).env
        ? (import.meta as any).env
        : {}
    const flag
      = metaEnv.VITE_SECONDARY_NAV_DEBUG
        ?? metaEnv.TALEX_SECONDARY_NAV_DEBUG
        ?? metaEnv.SECONDARY_NAV_DEBUG

    return flag === true || flag === 'true'
  }

  if (isDebugEnabled()) {
    watchEffect(() => {
      const matchedRoutes = route.matched.map(record => ({
        name: record.name,
        path: normalizePath(record.path),
        childCount: record.children?.length ?? 0,
      }))

      const treeDebug = parentLookupFromRoutes.value
        ? {
            parent: {
              name: parentLookupFromRoutes.value.parent.name,
              path: parentLookupFromRoutes.value.parentPath,
            },
            child: {
              name: parentLookupFromRoutes.value.child.name,
              path: parentLookupFromRoutes.value.childPath,
            },
          }
        : null

      const prefixDebug = parentByPrefix.value
        ? {
            parent: {
              name: parentByPrefix.value.parent.name,
              path: parentByPrefix.value.parentPath,
            },
          }
        : null

      const matchedDebug = parentRouteRecord.value
        ? {
            name: parentRouteRecord.value.name,
            path: normalizePath(parentRouteRecord.value.path),
          }
        : null

      console.debug(
        `[${options?.debugLabel ?? 'useSecondaryNavigation'}] Secondary nav debug`,
        {
          route: {
            name: route.name,
            path: normalizePath(route.path),
            matched: matchedRoutes,
          },
          treeParent: treeDebug,
          prefixParent: prefixDebug,
          matchedParent: matchedDebug,
          target: parentRouteTarget.value,
          canNavigateBack: canNavigateBack.value,
        },
      )
    })
  }

  return {
    canNavigateBack,
    parentRouteTarget,
    navigateBack,
  }
}
