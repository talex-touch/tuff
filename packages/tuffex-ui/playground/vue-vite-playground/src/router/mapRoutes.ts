export function mapRoutes(routes: {
  path: string
  component: any
}[]) {
  const pages = import.meta.glob('../pages/**/index.vue')
  removeHomePath(pages)
  for (const comp in pages) {
    routes.push({
      path: `/${formatPath(comp)}`,
      component: pages[comp]
    })
  }
  return routes
}

function formatPath(path: any) {
  const name = path.split('/')[2]
  return name
}

// 用于删除home组件
function removeHomePath(pages: any) {
  for (const item in pages) {
    if (item.includes('home')) {
      delete pages[item]
    }
  }
}