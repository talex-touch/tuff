export interface NexusPageRoute {
  file?: string
  children?: NexusPageRoute[]
}

function isRouteLocalPageComponent(file: string | undefined) {
  if (!file)
    return false

  const normalized = file.replace(/\\/g, '/')
  return normalized.includes('/app/pages/') && normalized.includes('/components/')
}

export function removeRouteLocalPageComponents(pages: NexusPageRoute[]) {
  for (let index = pages.length - 1; index >= 0; index -= 1) {
    const page = pages[index]
    if (page?.children)
      removeRouteLocalPageComponents(page.children)

    if (isRouteLocalPageComponent(page?.file))
      pages.splice(index, 1)
  }
}
