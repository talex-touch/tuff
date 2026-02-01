import { describe, expect, it } from 'vitest'

import {
  AppPreviewChannel,
  parseUpdateTag,
  resolveUpdateChannelLabel,
  splitUpdateTag,
} from '../../types/update'

describe('update tag helpers', () => {
  describe('resolveUpdateChannelLabel', () => {
    it('defaults to release when label is empty', () => {
      expect(resolveUpdateChannelLabel()).toBe(AppPreviewChannel.RELEASE)
      expect(resolveUpdateChannelLabel('')).toBe(AppPreviewChannel.RELEASE)
    })

    it('maps beta labels to BETA', () => {
      expect(resolveUpdateChannelLabel('beta')).toBe(AppPreviewChannel.BETA)
      expect(resolveUpdateChannelLabel('BETA.1')).toBe(AppPreviewChannel.BETA)
    })

    it('maps snapshot labels to SNAPSHOT', () => {
      expect(resolveUpdateChannelLabel('snapshot')).toBe(AppPreviewChannel.SNAPSHOT)
      expect(resolveUpdateChannelLabel('alpha')).toBe(AppPreviewChannel.SNAPSHOT)
    })

    it('maps release labels to RELEASE', () => {
      expect(resolveUpdateChannelLabel('release')).toBe(AppPreviewChannel.RELEASE)
      expect(resolveUpdateChannelLabel('master')).toBe(AppPreviewChannel.RELEASE)
    })
  })

  describe('splitUpdateTag', () => {
    it('splits tag without channel suffix', () => {
      expect(splitUpdateTag('v1.2.3')).toEqual({ version: '1.2.3', channelLabel: undefined })
    })

    it('splits tag with channel suffix', () => {
      expect(splitUpdateTag('1.2.3-beta.1')).toEqual({ version: '1.2.3', channelLabel: 'beta.1' })
    })

    it('trims tag before parsing', () => {
      expect(splitUpdateTag('  v1.2.3-SNAPSHOT  ')).toEqual({
        version: '1.2.3',
        channelLabel: 'SNAPSHOT',
      })
    })
  })

  describe('parseUpdateTag', () => {
    it('parses beta tags', () => {
      expect(parseUpdateTag('v1.2.3-beta').channel).toBe(AppPreviewChannel.BETA)
    })

    it('parses release tags without suffix', () => {
      expect(parseUpdateTag('1.2.3').channel).toBe(AppPreviewChannel.RELEASE)
    })

    it('parses alpha tags as snapshot', () => {
      expect(parseUpdateTag('v1.2.3-alpha').channel).toBe(AppPreviewChannel.SNAPSHOT)
    })
  })
})
