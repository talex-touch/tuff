import { describe, expect, it } from 'vitest'
import { removeRouteLocalPageComponents, type NexusPageRoute } from './nexus-page-routes'

describe('removeRouteLocalPageComponents', () => {
  it('removes nested page-local components without removing route pages', () => {
    const pages: NexusPageRoute[] = [
      {
        file: '/project/app/pages/dashboard.vue',
        children: [
          {
            file: '/project/app/pages/dashboard/admin/governance.vue',
            children: [
              {
                file: '/project/app/pages/dashboard/admin/components/GovernancePage.vue',
              },
            ],
          },
          {
            file: '/project/app/pages/sign-in/components/SignInEmailStep.vue',
          },
        ],
      },
      {
        file: '/project/app/pages/index.vue',
      },
    ]

    removeRouteLocalPageComponents(pages)

    expect(pages).toEqual([
      {
        file: '/project/app/pages/dashboard.vue',
        children: [
          {
            file: '/project/app/pages/dashboard/admin/governance.vue',
            children: [],
          },
        ],
      },
      {
        file: '/project/app/pages/index.vue',
      },
    ])
  })
})
