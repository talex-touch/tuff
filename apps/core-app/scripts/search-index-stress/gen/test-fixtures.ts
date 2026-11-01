import { existsSync, mkdtempSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import type { FsStep, GenerateOptions, ScenarioPlan } from '../types'
import { PROFILE_COUNTS, generatePlan } from './plan'

export const SEED = 20_261_030

/** Installed-app names in the shapes a real machine has: single words, spaced, punctuated, accented, CJK. */
export const APPS: string[] = [
  'Safari',
  'Finder',
  'Mail',
  'Calendar',
  'Notes',
  'Reminders',
  'Messages',
  'FaceTime',
  'Maps',
  'Photos',
  'Preview',
  'TextEdit',
  'Terminal',
  'Activity Monitor',
  'System Settings',
  'App Store',
  'Books',
  'Podcasts',
  'Music',
  'Stocks',
  'Weather',
  'Calculator',
  'Dictionary',
  'Font Book',
  'Image Capture',
  'Keychain Access',
  'Disk Utility',
  'Console',
  'Digital Color Meter',
  'Automator',
  'Visual Studio Code',
  'Xcode',
  'Docker Desktop',
  'Google Chrome',
  'Firefox',
  'Slack',
  'Discord',
  'Spotify',
  'Figma',
  'Sketch',
  'Notion',
  'Obsidian',
  '1Password 7',
  'Raycast',
  'Magnet',
  'Rectangle',
  'iTerm',
  'Sublime Text',
  'Microsoft Word',
  'Microsoft Excel',
  'Microsoft PowerPoint',
  'WPS Office',
  'Résumé Builder',
  'Café Terrace',
  'Zoom Workplace',
  'Telegram Desktop',
  'LINE',
  'KakaoTalk',
  'Pages',
  'Numbers',
  'Keynote',
  'GarageBand',
  'iMovie',
  '微信',
  '企业微信',
  '钉钉',
  '腾讯会议',
  '飞书',
  '哔哩哔哩',
  '网易云音乐',
  '百度网盘',
  '访达',
  '系统设置',
  '提醒事项',
  '备忘录',
  '照片',
  '预览',
  '计算器',
  '终端',
  '邮件',
  '地图',
  '信息',
  '相机',
  '时钟',
  '天气',
  '词典',
  '活动监视器',
  'メモ',
  '카카오톡'
]

export function optionsFor(count: number, extra: Partial<GenerateOptions> = {}): GenerateOptions {
  return { seed: SEED, count, apps: APPS, ...extra }
}

let smoke: ScenarioPlan | undefined

/** The smoke profile, generated once per test file (every file has its own module registry). */
export function smokePlan(): ScenarioPlan {
  smoke ??= generatePlan(optionsFor(PROFILE_COUNTS.smoke))
  return smoke
}

let medium: ScenarioPlan | undefined

/** 600 scenarios: enough that every class shows the variety the builder and validator tests look for. */
export function mediumPlan(): ScenarioPlan {
  medium ??= generatePlan(optionsFor(600))
  return medium
}

export const cloneOf = <T>(value: T): T => structuredClone(value)

/** Steps with `parallel` groups flattened, in start order. */
export function flatSteps(steps: readonly FsStep[]): FsStep[] {
  return steps.flatMap((step) => (step.op === 'parallel' ? flatSteps(step.steps) : [step]))
}

/** Paths that exist once the steps have run, by plain set arithmetic with no validator code involved. */
export function leftInPlace(steps: readonly FsStep[]): Set<string> {
  const files = new Set<string>()
  for (const step of flatSteps(steps)) {
    if (step.op === 'write' || step.op === 'write-atomic' || step.op === 'touch')
      files.add(step.path)
    else if (step.op === 'copy') files.add(step.to)
    else if (step.op === 'move') {
      files.delete(step.from)
      files.add(step.to)
    } else if (step.op === 'delete') files.delete(step.path)
  }
  return files
}

/** Scratch space lives under /tmp, never beside the sources. */
export function scratchDir(prefix: string): string {
  return mkdtempSync(join(realpathSync('/tmp'), prefix))
}

export const HAS_SIPS = process.platform === 'darwin' && existsSync('/usr/bin/sips')
