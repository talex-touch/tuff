// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import SettingTools from './SettingTools.vue'

interface QuickOpsCustomPomodoroTemplate {
  name: string
  aliases: string[]
  focusMinutes: number
  breakMinutes: number
  enabled: boolean
}

const settingState = vi.hoisted(() => {
  const { reactive } = require('vue') as typeof import('vue')
  return {
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
      quickOps: {
        enabled: true,
        showRunningSessionsInCoreBox: true,
        defaultKeepAwakeDurationMinutes: 60,
        defaultSystemAwakeDurationMinutes: 60,
        defaultTimerDurationMinutes: 25,
        defaultTimerExtendMinutes: 5,
        defaultPomodoroFocusMinutes: 25,
        defaultPomodoroBreakMinutes: 5,
        pomodoroTemplates: {
          classic: true,
          long: true,
          custom: [] as QuickOpsCustomPomodoroTemplate[]
        },
        defaultScreenCleanDurationSeconds: 60,
        defaultScreenCleanMode: 'black',
        allowPublicIpLookup: false
      }
    })
  }
})

const { appSettingMock } = settingState

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
  appSettingMock.quickOps = {
    enabled: true,
    showRunningSessionsInCoreBox: true,
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
  }
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

describe('SettingTools QuickOps settings', () => {
  beforeEach(() => {
    resetAppSetting()
  })

  it('renders QuickOps default preference controls', async () => {
    const wrapper = mountSettingTools()
    await nextTick()

    expect(wrapper.text()).toContain('settingTools.quickOpsEnabled')
    expect(wrapper.text()).toContain('settingTools.quickOpsShowRunningSessions')
    expect(wrapper.text()).toContain('settingTools.quickOpsDefaultKeepAwakeDuration')
    expect(wrapper.text()).toContain('settingTools.quickOpsDefaultTimerDuration')
    expect(wrapper.text()).toContain('settingTools.quickOpsDefaultTimerExtendDuration')
    expect(wrapper.text()).toContain('settingTools.quickOpsDefaultPomodoroFocus')
    expect(wrapper.text()).toContain('settingTools.quickOpsDefaultPomodoroBreak')
    expect(wrapper.text()).toContain('settingTools.quickOpsPomodoroClassicTemplate')
    expect(wrapper.text()).toContain('settingTools.quickOpsPomodoroLongTemplate')
    expect(wrapper.text()).toContain('settingTools.quickOpsDefaultScreenCleanDuration')
    expect(wrapper.text()).toContain('settingTools.quickOpsDefaultScreenCleanMode')
  })

  it('normalizes invalid QuickOps stored preferences to supported defaults', async () => {
    appSettingMock.quickOps = {
      enabled: 'yes' as never,
      showRunningSessionsInCoreBox: 'no' as never,
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

    mountSettingTools()
    await nextTick()

    expect(appSettingMock.quickOps).toEqual({
      enabled: true,
      showRunningSessionsInCoreBox: true,
      defaultKeepAwakeDurationMinutes: 60,
      defaultSystemAwakeDurationMinutes: 90,
      defaultTimerDurationMinutes: 25,
      defaultTimerExtendMinutes: 5,
      defaultPomodoroFocusMinutes: 40,
      defaultPomodoroBreakMinutes: 8,
      pomodoroTemplates: {
        classic: true,
        long: true,
        custom: [
          {
            name: 'writing sprint',
            aliases: ['写作'],
            focusMinutes: 45,
            breakMinutes: 12,
            enabled: true
          }
        ]
      },
      defaultScreenCleanDurationSeconds: 60,
      defaultScreenCleanMode: 'black',
      allowPublicIpLookup: false
    })
  })

  it('preserves valid QuickOps pomodoro template switches', async () => {
    appSettingMock.quickOps.pomodoroTemplates = {
      classic: false,
      long: true,
      custom: []
    }

    mountSettingTools()
    await nextTick()

    expect(appSettingMock.quickOps.pomodoroTemplates).toEqual({
      classic: false,
      long: true,
      custom: []
    })
  })

  it('shows system-awake duration only in advanced settings', async () => {
    const basicWrapper = mountSettingTools()
    await nextTick()
    expect(basicWrapper.text()).not.toContain('settingTools.quickOpsDefaultSystemAwakeDuration')
    expect(basicWrapper.text()).not.toContain('settingTools.quickOpsAllowPublicIpLookup')
    expect(basicWrapper.text()).not.toContain('settingTools.quickOpsPomodoroCustomTemplates')

    appSettingMock.dev.advancedSettings = true
    appSettingMock.quickOps.pomodoroTemplates.custom = [
      {
        name: 'writing sprint',
        aliases: ['写作'],
        focusMinutes: 45,
        breakMinutes: 12,
        enabled: true
      }
    ] as QuickOpsCustomPomodoroTemplate[]
    const advancedWrapper = mountSettingTools()
    await nextTick()
    expect(advancedWrapper.text()).toContain('settingTools.quickOpsDefaultSystemAwakeDuration')
    expect(advancedWrapper.text()).toContain('settingTools.quickOpsAllowPublicIpLookup')
    expect(advancedWrapper.text()).toContain('settingTools.quickOpsPomodoroCustomTemplates')
    expect(advancedWrapper.text()).toContain('writing sprint 45/12')
  })
})
