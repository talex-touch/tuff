import type {
  IExecuteArgs,
  IProviderActivate,
  ISearchProvider,
  TuffItem,
  TuffQuery,
  TuffSearchResult,
} from '@talex-touch/utils'
import type { ProviderContext } from '../../search-engine/types'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import {
  TuffFactory,
  TuffInputType,
} from '@talex-touch/utils'
import { TuffItemBuilder } from '@talex-touch/utils/core-box'
import { dialog, shell } from 'electron'
import { PermissionChecker, PermissionStatus } from '../../../system/permission-checker'

const execAsync = promisify(exec)

interface SystemAction {
  id: string
  name: string
  description: string
  keywords: string[]
  icon?: string
  requiresAdmin?: boolean
  execute: () => Promise<void>
}

class SystemProvider implements ISearchProvider<ProviderContext> {
  readonly id = 'system-provider'
  readonly name = 'System Provider'
  readonly type = 'system' as const
  readonly supportedInputTypes = [TuffInputType.Text]

  private permissionChecker: PermissionChecker | null = null
  private actions: SystemAction[] = []

  constructor() {
    this.initializeActions()
  }

  private initializeActions(): void {
    const isMac = process.platform === 'darwin'
    const isWindows = process.platform === 'win32'

    this.actions = []

    // Shutdown
    this.actions.push({
      id: 'shutdown',
      name: isMac ? '关机' : '关机',
      description: isMac ? '关闭计算机' : '关闭计算机',
      keywords: ['关机', '关闭', 'shutdown', 'power off', '关闭电脑'],
      icon: 'power',
      requiresAdmin: true,
      execute: async () => {
        if (isMac) {
          try {
            const result = await dialog.showMessageBox({
              type: 'question',
              title: '确认关机',
              message: '确定要关闭计算机吗？',
              detail: '此操作需要管理员权限，可能会提示输入密码。',
              buttons: ['取消', '确定'],
              defaultId: 0,
              cancelId: 0,
            })
            if (result.response === 1) {
              await execAsync('osascript -e \'tell app "System Events" to shut down\'')
            }
          }
          catch (error) {
            await this.showPermissionError('关机')
          }
        }
        else if (isWindows) {
          try {
            await execAsync('shutdown /s /t 0')
          }
          catch (error) {
            await this.showPermissionError('关机')
          }
        }
      },
    })

    // Restart
    this.actions.push({
      id: 'restart',
      name: isMac ? '重启' : '重启',
      description: isMac ? '重启计算机' : '重启计算机',
      keywords: ['重启', '重新启动', 'restart', 'reboot', '重启电脑'],
      icon: 'restart',
      requiresAdmin: true,
      execute: async () => {
        if (isMac) {
          try {
            const result = await dialog.showMessageBox({
              type: 'question',
              title: '确认重启',
              message: '确定要重启计算机吗？',
              detail: '此操作需要管理员权限，可能会提示输入密码。',
              buttons: ['取消', '确定'],
              defaultId: 0,
              cancelId: 0,
            })
            if (result.response === 1) {
              await execAsync('osascript -e \'tell app "System Events" to restart\'')
            }
          }
          catch (error) {
            await this.showPermissionError('重启')
          }
        }
        else if (isWindows) {
          try {
            await execAsync('shutdown /r /t 0')
          }
          catch (error) {
            await this.showPermissionError('重启')
          }
        }
      },
    })

    // Lock Screen
    this.actions.push({
      id: 'lock-screen',
      name: isMac ? '锁定屏幕' : '锁定屏幕',
      description: isMac ? '锁定屏幕' : '锁定屏幕',
      keywords: ['锁定', '锁屏', 'lock', 'lock screen', '锁定屏幕'],
      icon: 'lock',
      requiresAdmin: false,
      execute: async () => {
        if (isMac) {
          // macOS: 使用 pmset displaysleepnow（无需密码）
          await execAsync('pmset displaysleepnow')
        }
        else if (isWindows) {
          // Windows: 使用 rundll32（无需管理员权限）
          await execAsync('rundll32.exe user32.dll,LockWorkStation')
        }
      },
    })

    // Volume Up
    this.actions.push({
      id: 'volume-up',
      name: '增加音量',
      description: '增加系统音量',
      keywords: ['音量', '增加音量', 'volume up', '音量+', '声音'],
      icon: 'volume-up',
      requiresAdmin: false,
      execute: async () => {
        if (isMac) {
          // macOS: 使用 osascript 调整音量（通常不需要密码）
          await execAsync('osascript -e \'set volume output volume (output volume of (get volume settings) + 10)\'')
        }
        else if (isWindows) {
          // Windows: 使用 PowerShell
          await execAsync(
            'powershell -Command "(New-Object -ComObject Shell.Application).NameSpace(17).ParseName(\'Volume Control\').InvokeVerb(\'properties\')"',
          )
        }
      },
    })

    // Volume Down
    this.actions.push({
      id: 'volume-down',
      name: '降低音量',
      description: '降低系统音量',
      keywords: ['音量', '降低音量', 'volume down', '音量-', '声音'],
      icon: 'volume-down',
      requiresAdmin: false,
      execute: async () => {
        if (isMac) {
          await execAsync('osascript -e \'set volume output volume (output volume of (get volume settings) - 10)\'')
        }
        else if (isWindows) {
          await execAsync(
            'powershell -Command "(New-Object -ComObject Shell.Application).NameSpace(17).ParseName(\'Volume Control\').InvokeVerb(\'properties\')"',
          )
        }
      },
    })

    // Mute
    this.actions.push({
      id: 'mute',
      name: '静音',
      description: '静音/取消静音',
      keywords: ['静音', 'mute', '无声', '关闭声音'],
      icon: 'volume-mute',
      requiresAdmin: false,
      execute: async () => {
        if (isMac) {
          await execAsync('osascript -e \'set volume output muted not (output muted of (get volume settings))\'')
        }
        else if (isWindows) {
          // Windows: 使用 nircmd 或 PowerShell
          await execAsync('powershell -Command "$wshShell = New-Object -ComObject WScript.Shell; $wshShell.SendKeys([char]173)"')
        }
      },
    })

    // Brightness Up (macOS only, Windows requires different approach)
    if (isMac) {
      this.actions.push({
        id: 'brightness-up',
        name: '增加亮度',
        description: '增加屏幕亮度',
        keywords: ['亮度', '增加亮度', 'brightness up', '亮度+'],
        icon: 'sun',
        requiresAdmin: false,
        execute: async () => {
          await execAsync('osascript -e \'tell application "System Events" to key code 144\'')
        },
      })

      this.actions.push({
        id: 'brightness-down',
        name: '降低亮度',
        description: '降低屏幕亮度',
        keywords: ['亮度', '降低亮度', 'brightness down', '亮度-'],
        icon: 'moon',
        requiresAdmin: false,
        execute: async () => {
          await execAsync('osascript -e \'tell application "System Events" to key code 145\'')
        },
      })
    }
  }

  private async showPermissionError(action: string): Promise<void> {
    const result = await dialog.showMessageBox({
      type: 'warning',
      title: '权限不足',
      message: `执行"${action}"操作需要管理员权限`,
      detail: '请以管理员身份运行应用，或手动执行该操作。',
      buttons: ['确定', '打开系统设置'],
    })

    if (result.response === 1) {
      // Open system settings
      if (process.platform === 'darwin') {
        await shell.openExternal('x-apple.systempreferences:com.apple.preference.security')
      }
      else if (process.platform === 'win32') {
        await shell.openExternal('ms-settings:')
      }
    }
  }

  async onLoad(_context: ProviderContext): Promise<void> {
    this.permissionChecker = PermissionChecker.getInstance()
    console.log('[SystemProvider] System provider loaded')
  }

  async onSearch(query: TuffQuery, _signal: AbortSignal): Promise<TuffSearchResult> {
    const searchText = (query.text || '').toLowerCase().trim()
    if (!searchText) {
      return TuffFactory.createSearchResult(query).build()
    }

    const matchedActions = this.actions.filter((action) => {
      const nameMatch = action.name.toLowerCase().includes(searchText)
      const keywordMatch = action.keywords.some(keyword =>
        keyword.toLowerCase().includes(searchText),
      )
      return nameMatch || keywordMatch
    })

    const items: TuffItem[] = matchedActions.map((action) => {
      return new TuffItemBuilder(action.id, this.type, this.id)
        .setTitle(action.name)
        .setDescription(action.description)
        .setKind('command')
        .setSource(this.type, this.id, this.name)
        .setScoring({
          final: 100,
          match: 100,
          recency: 0,
          frequency: 0,
          base: 0,
        })
        .setMeta({
          raw: {
            systemActionId: action.id,
          },
          icon: action.icon,
        })
        .build()
    })

    return TuffFactory.createSearchResult(query).setItems(items).build()
  }

  async onExecute({ item }: IExecuteArgs): Promise<IProviderActivate | null> {
    const actionMeta = item.meta?.raw as { systemActionId?: string } | undefined
    const action = actionMeta
      ? this.actions.find(candidate => candidate.id === actionMeta.systemActionId)
      : undefined
    if (!action) {
      console.error('[SystemProvider] Action not found in item meta')
      return null
    }

    // Check permissions if required
    if (action.requiresAdmin && this.permissionChecker) {
      const adminCheck = this.permissionChecker.checkAdminPrivileges()
      if (adminCheck.status !== PermissionStatus.GRANTED) {
        await this.showPermissionError(action.name)
        return null
      }
    }

    try {
      await action.execute()
      console.log(`[SystemProvider] Executed action: ${action.name}`)
    }
    catch (error) {
      console.error(`[SystemProvider] Failed to execute action ${action.name}:`, error)
      await dialog.showMessageBox({
        type: 'error',
        title: '操作失败',
        message: `执行"${action.name}"操作时发生错误`,
        detail: error instanceof Error ? error.message : String(error),
      })
    }

    return null
  }
}

export const systemProvider = new SystemProvider()
