import { eq } from 'drizzle-orm'
import { db } from '@main/db'
import { customApps } from '@main/db/schema'
import { pinyin } from 'pinyin-pro'
import path from 'node:path'
import fs from 'node:fs'
import { shell } from 'electron'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export interface CustomApp {
  id: number
  path: string
  displayName: string
  iconPath?: string
  launchCommand?: string
  workingDirectory?: string
  environmentVars?: Record<string, string>
  fileType: string
  enabled: boolean
  createdAt: number
  updatedAt: number
  lastUsedAt?: number
  useCount: number
  notes?: string
}

export interface CustomAppInput {
  path: string
  displayName: string
  iconPath?: string
  launchCommand?: string
  workingDirectory?: string
  environmentVars?: Record<string, string>
  notes?: string
}

export class CustomAppProvider {
  /**
   * 添加自定义应用
   */
  async addCustomApp(input: CustomAppInput): Promise<CustomApp> {
    // 验证文件是否存在
    if (!fs.existsSync(input.path)) {
      throw new Error(`File not found: ${input.path}`)
    }

    // 检测文件类型
    const fileType = this.detectFileType(input.path)

    // 如果没有指定工作目录，使用文件所在目录
    const workingDirectory = input.workingDirectory || path.dirname(input.path)

    const now = Date.now()
    const result = await db
      .insert(customApps)
      .values({
        path: input.path,
        displayName: input.displayName,
        iconPath: input.iconPath,
        launchCommand: input.launchCommand,
        workingDirectory,
        environmentVars: input.environmentVars ? JSON.stringify(input.environmentVars) : null,
        fileType,
        enabled: true,
        createdAt: now,
        updatedAt: now,
        useCount: 0,
        notes: input.notes
      })
      .returning()

    return this.mapDbToCustomApp(result[0])
  }

  /**
   * 更新自定义应用
   */
  async updateCustomApp(id: number, updates: Partial<CustomAppInput>): Promise<CustomApp> {
    const now = Date.now()
    const updateData: any = {
      ...updates,
      updatedAt: now
    }

    if (updates.environmentVars) {
      updateData.environmentVars = JSON.stringify(updates.environmentVars)
    }

    const result = await db
      .update(customApps)
      .set(updateData)
      .where(eq(customApps.id, id))
      .returning()

    if (!result.length) {
      throw new Error(`Custom app not found: ${id}`)
    }

    return this.mapDbToCustomApp(result[0])
  }

  /**
   * 删除自定义应用
   */
  async deleteCustomApp(id: number): Promise<void> {
    await db.delete(customApps).where(eq(customApps.id, id))
  }

  /**
   * 获取所有自定义应用
   */
  async getAllCustomApps(): Promise<CustomApp[]> {
    const result = await db.select().from(customApps)
    return result.map((row) => this.mapDbToCustomApp(row))
  }

  /**
   * 获取启用的自定义应用
   */
  async getEnabledCustomApps(): Promise<CustomApp[]> {
    const result = await db.select().from(customApps).where(eq(customApps.enabled, true))
    return result.map((row) => this.mapDbToCustomApp(row))
  }

  /**
   * 获取单个自定义应用
   */
  async getCustomApp(id: number): Promise<CustomApp | null> {
    const result = await db.select().from(customApps).where(eq(customApps.id, id))
    if (!result.length) {
      return null
    }
    return this.mapDbToCustomApp(result[0])
  }

  /**
   * 启动自定义应用
   */
  async launchCustomApp(id: number): Promise<void> {
    const app = await this.getCustomApp(id)
    if (!app) {
      throw new Error(`Custom app not found: ${id}`)
    }

    if (!app.enabled) {
      throw new Error(`Custom app is disabled: ${app.displayName}`)
    }

    // 更新使用统计
    await db
      .update(customApps)
      .set({
        lastUsedAt: Date.now(),
        useCount: app.useCount + 1
      })
      .where(eq(customApps.id, id))

    // 启动应用
    await this.launch(app)
  }

  /**
   * 启动应用的具体实现
   */
  private async launch(app: CustomApp): Promise<void> {
    const { path: appPath, launchCommand, workingDirectory, environmentVars } = app

    // 如果指定了启动命令，使用命令启动
    if (launchCommand) {
      const env = environmentVars
        ? { ...process.env, ...environmentVars }
        : process.env

      await execAsync(launchCommand, {
        cwd: workingDirectory,
        env
      })
      return
    }

    // 否则根据文件类型决定启动方式
    switch (app.fileType) {
      case 'jar':
        // JAR 文件使用 java -jar 启动
        await execAsync(`java -jar "${appPath}"`, {
          cwd: workingDirectory
        })
        break

      case 'sh':
      case 'bash':
        // Shell 脚本
        await execAsync(`bash "${appPath}"`, {
          cwd: workingDirectory
        })
        break

      case 'py':
        // Python 脚本
        await execAsync(`python3 "${appPath}"`, {
          cwd: workingDirectory
        })
        break

      case 'app':
      case 'exe':
      case 'other':
      default:
        // 其他文件使用系统默认程序打开
        await shell.openPath(appPath)
        break
    }
  }

  /**
   * 生成搜索关键词（包括拼音）
   */
  generateKeywords(displayName: string): string[] {
    const keywords: string[] = []

    // 添加原始名称
    keywords.push(displayName.toLowerCase())

    // 如果包含中文，添加拼音
    if (/[\u4e00-\u9fa5]/.test(displayName)) {
      // 全拼
      const fullPinyin = pinyin(displayName, { toneType: 'none', type: 'array' })
        .join('')
        .toLowerCase()
      keywords.push(fullPinyin)

      // 首字母
      const firstLetters = pinyin(displayName, { pattern: 'first', toneType: 'none' })
        .toLowerCase()
        .replace(/\s+/g, '')
      keywords.push(firstLetters)
    }

    // 添加文件名（不含扩展名）
    const fileName = path.basename(displayName, path.extname(displayName))
    if (fileName !== displayName) {
      keywords.push(fileName.toLowerCase())
    }

    return [...new Set(keywords)]
  }

  /**
   * 检测文件类型
   */
  private detectFileType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase()

    const typeMap: Record<string, string> = {
      '.jar': 'jar',
      '.exe': 'exe',
      '.app': 'app',
      '.sh': 'sh',
      '.bash': 'bash',
      '.py': 'py',
      '.js': 'js',
      '.ts': 'ts',
      '.rb': 'rb',
      '.pl': 'pl'
    }

    return typeMap[ext] || 'other'
  }

  /**
   * 将数据库记录映射为 CustomApp 对象
   */
  private mapDbToCustomApp(row: any): CustomApp {
    return {
      id: row.id,
      path: row.path,
      displayName: row.displayName,
      iconPath: row.iconPath || undefined,
      launchCommand: row.launchCommand || undefined,
      workingDirectory: row.workingDirectory || undefined,
      environmentVars: row.environmentVars ? JSON.parse(row.environmentVars) : undefined,
      fileType: row.fileType,
      enabled: Boolean(row.enabled),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastUsedAt: row.lastUsedAt || undefined,
      useCount: row.useCount,
      notes: row.notes || undefined
    }
  }

  /**
   * 切换启用/禁用状态
   */
  async toggleEnabled(id: number): Promise<CustomApp> {
    const app = await this.getCustomApp(id)
    if (!app) {
      throw new Error(`Custom app not found: ${id}`)
    }

    const result = await db
      .update(customApps)
      .set({
        enabled: !app.enabled,
        updatedAt: Date.now()
      })
      .where(eq(customApps.id, id))
      .returning()

    return this.mapDbToCustomApp(result[0])
  }
}

// 导出单例
export const customAppProvider = new CustomAppProvider()
