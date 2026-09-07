// @vitest-environment node
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import viteConfig, { createLegalCommentPreservingStripper } from '../../vite.config.js'

describe('TuffEx stylesheet comment stripping', () => {
  it('removes ordinary comments while preserving legal notices', async () => {
    const result = await postcss([createLegalCommentPreservingStripper()]).process(
      `/* implementation note */
/*! bundled license */
/* @license MIT */
/* Copyright 2026 Talex */
.button { color: rebeccapurple; }`,
      { from: undefined }
    )

    expect(result.css).not.toContain('implementation note')
    expect(result.css).toContain('/*! bundled license */')
    expect(result.css).toContain('@license MIT')
    expect(result.css).toContain('Copyright 2026 Talex')
    expect(result.css).toContain('.button { color: rebeccapurple; }')
  })

  it('installs the stripping plugin in the CSS build pipeline', () => {
    const plugins = viteConfig.css?.postcss?.plugins ?? []

    expect(plugins).toContainEqual(
      expect.objectContaining({ postcssPlugin: 'tuffex-strip-nonlegal-comments' })
    )
  })
})
