// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import SettingTools from './SettingTools.vue'

interface QuickOpsSettingMock {
  enabled: boolean
  showRunningSessionsInCoreBox: boolean
  allowStatefulTools: boolean
  allowNetworkTools: boolean
  allowFileTools: boolean
  allowSystemTools: boolean
  allowDeveloperTools: boolean
  allowHighRiskTools: boolean
  defaultKeepAwakeDurationMinutes: number
  defaultSystemAwakeDurationMinutes: number
  defaultTimerDurationMinutes: number
  defaultTimerExtendMinutes: number
  defaultPomodoroFocusMinutes: number
  defaultPomodoroBreakMinutes: number
  pomodoroTemplates: {
    classic: boolean
    long: boolean
    custom: Array<{
      name: string
      aliases: string[]
      focusMinutes: number
      breakMinutes: number
      enabled: boolean
    }>
  }
  defaultScreenCleanDurationSeconds: number
  defaultScreenCleanMode: string
  allowPublicIpLookup: boolean
}

const settingState = vi.hoisted(() => {
  const { reactive } = require('vue') as typeof import('vue')
  const createQuickOpsSetting = (): QuickOpsSettingMock => ({
    enabled: true,
    showRunningSessionsInCoreBox: true,
    allowStatefulTools: true,
    allowNetworkTools: true,
    allowFileTools: true,
    allowSystemTools: true,
    allowDeveloperTools: true,
    allowHighRiskTools: false,
    defaultKeepAwakeDurationMinutes: 60,
    defaultSystemAwakeDurationMinutes: 60,
    defaultTimerDurationMinutes: 25,
    defaultTimerExtendMinutes: 5,
    defaultPomodoroFocusMinutes: 25,
    defaultPomodoroBreakMinutes: 5,
    pomodoroTemplates: {
      classic: true,
      long: true,
      custom: []
    },
    defaultScreenCleanDurationSeconds: 60,
    defaultScreenCleanMode: 'black',
    allowPublicIpLookup: false
  })

  return {
    createQuickOpsSetting,
    appSettingMock: reactive({
      coreBox: {
        customPlaceholder: ''
      },
      beginner: {
        init: false
      },
      dev: {
        advancedSettings: false
      },
      tools: {
        autoPaste: {
          enable: true,
          time: 5
        },
        autoHide: true,
        autoClear: 300,
        clipboardPolling: {
          interval: 3,
          lowBatteryPolicy: {
            enable: true,
            interval: 10
          }
        }
      },
      omniPanel: {
        enableShortcut: false,
        enableMouseLongPress: true,
        mouseLongPressDurationMs: 600,
        autoMountFirstFeatureOnPluginInstall: false,
        featureHub: {
          items: []
        }
      },
      recommendation: {
        enabled: true,
        maxItems: 10,
        showReason: true,
        semantic: {
          localVectorEnabled: true,
          aiRerankEnabled: false,
          aiEmbeddingEnabled: false
        },
        contextSources: {
          time: true,
          foregroundApp: true,
          clipboard: true,
          network: true,
          bluetooth: true,
          focus: true,
          power: true,
          location: true
        }
      },
      quickOps: createQuickOpsSetting()
    })
  }
})

const { appSettingMock, createQuickOpsSetting } = settingState

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: vi.fn(async () => ({ status: 'granted', canRequest: false }))
  })
}))

vi.mock('@talex-touch/utils/transport/event/builder', () => ({
  defineEvent: () => ({
    module: () => ({
      event: () => ({
        define: () => 'system:permission:check'
      })
    })
  })
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: vi.fn()
  }
}))

vi.mock('~/modules/platform/renderer-platform', () => ({
  useRendererPlatform: () => ({
    isMac: { value: false }
  })
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({
    warn: vi.fn()
  })
}))

vi.mock('~/modules/channel/main/shortcon', () => ({
  shortconApi: {
    getAll: vi.fn(async () => [])
  }
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: settingState.appSettingMock
}))

function resetAppSetting(): void {
  appSettingMock.dev.advancedSettings = false
  appSettingMock.quickOps = createQuickOpsSetting()
}

function mountSettingTools() {
  return mount(SettingTools, {
    global: {
      stubs: {
        TuffGroupBlock: { template: '<section><slot /></section>' },
        TuffBlockInput: {
          template: '<label><span>{{ title }}</span><slot name="control" /></label>',
          props: ['title']
        },
        TuffBlockSlot: {
          template: '<div><span>{{ title }}</span><slot /></div>',
          props: ['title']
        },
        TuffBlockSwitch: {
          template:
            '<label><span>{{ title }}</span><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" /></label>',
          props: ['modelValue', 'title'],
          emits: ['update:modelValue']
        },
        TuffBlockSelect: {
          template:
            '<label><span>{{ title }}</span><select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select></label>',
          props: ['modelValue', 'title'],
          emits: ['update:modelValue']
        },
        TxSelectItem: { template: '<option :value="value"><slot /></option>', props: ['value'] },
        TuffSelectItem: { template: '<option :value="value"><slot /></option>', props: ['value'] },
        TxInput: { template: '<input />' },
        TxButton: { template: '<button><slot /></button>' },
        ShortcutDialog: { template: '<div />' }
      }
    }
  })
}

describe('SettingTools QuickOps settings boundary', () => {
  beforeEach(() => {
    resetAppSetting()
  })

  it('does not render QuickOps preference controls in CoreApp Tools settings', async () => {
    appSettingMock.dev.advancedSettings = true
    appSettingMock.quickOps.pomodoroTemplates.custom = [
      {
        name: 'writing sprint',
        aliases: ['写作'],
        focusMinutes: 45,
        breakMinutes: 12,
        enabled: true
      }
    ]
    const wrapper = mountSettingTools()
    await nextTick()
    const text = wrapper.text()

    expect(text).toContain('settingTools.autoPaste')
    expect(text).not.toContain('settingTools.quickOpsEnabled')
    expect(text).not.toContain('settingTools.quickOpsShowRunningSessions')
    expect(text).not.toContain('settingTools.quickOpsDefaultKeepAwakeDuration')
    expect(text).not.toContain('settingTools.quickOpsDefaultSystemAwakeDuration')
    expect(text).not.toContain('settingTools.quickOpsDefaultTimerDuration')
    expect(text).not.toContain('settingTools.quickOpsDefaultTimerExtendDuration')
    expect(text).not.toContain('settingTools.quickOpsDefaultPomodoroFocus')
    expect(text).not.toContain('settingTools.quickOpsDefaultPomodoroBreak')
    expect(text).not.toContain('settingTools.quickOpsPomodoroClassicTemplate')
    expect(text).not.toContain('settingTools.quickOpsPomodoroLongTemplate')
    expect(text).not.toContain('settingTools.quickOpsAllowStatefulTools')
    expect(text).not.toContain('settingTools.quickOpsAllowNetworkTools')
    expect(text).not.toContain('settingTools.quickOpsAllowFileTools')
    expect(text).not.toContain('settingTools.quickOpsAllowSystemTools')
    expect(text).not.toContain('settingTools.quickOpsAllowDeveloperTools')
    expect(text).not.toContain('settingTools.quickOpsAllowHighRiskTools')
    expect(text).not.toContain('settingTools.quickOpsAllowPublicIpLookup')
    expect(text).not.toContain('settingTools.quickOpsPomodoroCustomTemplates')
    expect(text).not.toContain('settingTools.quickOpsDefaultScreenCleanDuration')
    expect(text).not.toContain('settingTools.quickOpsDefaultScreenCleanMode')
    expect(text).not.toContain('writing sprint 45/12')
  })

  it('leaves stored QuickOps preferences untouched while plugin owns the settings surface', async () => {
    appSettingMock.quickOps = {
      enabled: 'yes' as never,
      showRunningSessionsInCoreBox: 'no' as never,
      allowStatefulTools: 'no' as never,
      allowNetworkTools: 'no' as never,
      allowFileTools: 'no' as never,
      allowSystemTools: 'no' as never,
      allowDeveloperTools: 'no' as never,
      allowHighRiskTools: 'yes' as never,
      defaultKeepAwakeDurationMinutes: 61,
      defaultSystemAwakeDurationMinutes: 77,
      defaultTimerDurationMinutes: 26,
      defaultTimerExtendMinutes: 7,
      defaultPomodoroFocusMinutes: 33,
      defaultPomodoroBreakMinutes: 9,
      pomodoroTemplates: {
        classic: 'yes' as never,
        long: 'no' as never,
        custom: [
          {
            name: ' writing sprint ',
            aliases: [' 写作 ', '', 1],
            focusMinutes: '45',
            breakMinutes: '12',
            enabled: 'yes'
          },
          {
            name: '',
            aliases: [],
            focusMinutes: 25,
            breakMinutes: 5,
            enabled: true
          }
        ] as never
      },
      defaultScreenCleanDurationSeconds: 70,
      defaultScreenCleanMode: 'blue' as never,
      allowPublicIpLookup: 'yes' as never
    }
    const snapshot = JSON.parse(JSON.stringify(appSettingMock.quickOps))

    mountSettingTools()
    await nextTick()

    expect(JSON.parse(JSON.stringify(appSettingMock.quickOps))).toEqual(snapshot)
  })
})
