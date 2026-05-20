import { describe, expect, it } from 'vitest'
import { createThemeDetailRoute } from './section-route'

describe('style section route', () => {
  it('links window material cards to the registered theme detail path', () => {
    expect(createThemeDetailRoute('pure')).toEqual({
      path: '/styles/theme',
      query: {
        theme: 'pure'
      }
    })
  })
})
