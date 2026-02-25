import { describe, expect, it } from 'vitest'
import { isNoisySystemApp, matchNoisySystemAppRule } from './app-noise-filter'

describe('app-noise-filter', () => {
  it('识别 Simulator 相关噪音应用', () => {
    expect(
      matchNoisySystemAppRule({
        bundleId: 'com.apple.CoreSimulator.SimulatorTrampoline'
      })
    ).toBe('simulator')

    expect(
      matchNoisySystemAppRule({
        path: '/Applications/Xcode.app/Contents/Developer/Applications/Simulator.app'
      })
    ).toBe('simulator')

    expect(
      matchNoisySystemAppRule({
        name: 'iPhone Simulator'
      })
    ).toBe('simulator')
  })

  it('识别 CoreServices Helper/Agent 噪音应用', () => {
    expect(
      matchNoisySystemAppRule({
        path: '/System/Library/CoreServices/DiscHelper.app',
        name: 'DiscHelper'
      })
    ).toBe('coreservices-helper')

    expect(
      matchNoisySystemAppRule({
        path: '/System/Library/CoreServices/OSDUIHelper.app',
        name: 'OSDUIHelper'
      })
    ).toBe('coreservices-helper')

    expect(
      matchNoisySystemAppRule({
        path: '/System/Library/CoreServices/TMHelperAgent.app',
        name: 'TMHelperAgent'
      })
    ).toBe('coreservices-helper')
  })

  it('识别开发辅助噪音入口', () => {
    expect(
      matchNoisySystemAppRule({
        name: 'Install Command Line Developer Tools'
      })
    ).toBe('developer-support')
  })

  it('常用主应用不应被过滤', () => {
    expect(
      isNoisySystemApp({
        path: '/System/Library/CoreServices/Finder.app',
        bundleId: 'com.apple.finder',
        name: 'Finder'
      })
    ).toBe(false)

    expect(
      isNoisySystemApp({
        path: '/Applications/Google Chrome.app',
        bundleId: 'com.google.Chrome',
        name: 'Google Chrome'
      })
    ).toBe(false)

    expect(
      isNoisySystemApp({
        path: '/Applications/IntelliJ IDEA.app',
        bundleId: 'com.jetbrains.intellij',
        name: 'IntelliJ IDEA'
      })
    ).toBe(false)
  })

  it('支持大小写与缺失字段的边界输入', () => {
    expect(
      isNoisySystemApp({
        path: '/SYSTEM/LIBRARY/CORESERVICES/OSDUIHELPER.APP'
      })
    ).toBe(true)

    expect(
      isNoisySystemApp({
        name: 'install command line developer tools'
      })
    ).toBe(true)

    expect(isNoisySystemApp({})).toBe(false)
  })

  it('白名单优先生效，避免误杀', () => {
    expect(
      matchNoisySystemAppRule({
        path: '/System/Library/CoreServices/Finder Helper.app',
        bundleId: 'com.apple.finder',
        name: 'Finder Helper'
      })
    ).toBeNull()
  })
})
