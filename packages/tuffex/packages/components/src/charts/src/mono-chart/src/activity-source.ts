// Adapted from Amicro GitHubActivity (MIT).
// Copyright (c) 2026 SYED  SUBHAN UDDIN
import type { MonoChartActivityLoader, MonoChartContribution, MonoChartRepo } from './types'
import { networkClient } from '@talex-touch/utils/network'

/** Public source adapter; callers can replace it for authenticated or proxied data. */
export const loadGitHubActivity: MonoChartActivityLoader = async (username, signal) => {
  const login = encodeURIComponent(username)
  const [calendarResponse, eventsResponse] = await Promise.all([
    networkClient.request({ url: `https://github-contributions-api.jogruber.de/v4/${login}?y=last`, signal }),
    networkClient.request({ url: `https://api.github.com/users/${login}/events/public?per_page=100`, signal }),
  ])
  const calendar: unknown = calendarResponse.data
  const events: unknown = eventsResponse.data
  if (!calendar || typeof calendar !== 'object' || !('contributions' in calendar) || !Array.isArray(calendar.contributions) || !Array.isArray(events))
    throw new Error('Invalid GitHub activity response')
  const contributions: MonoChartContribution[] = []
  for (const day of calendar.contributions) {
    if (!day || typeof day !== 'object' || typeof day.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date) || typeof day.count !== 'number' || !Number.isFinite(day.count) || typeof day.level !== 'number' || !Number.isInteger(day.level) || day.level < 0 || day.level > 4)
      throw new Error('Invalid GitHub contribution day')
    contributions.push({ date: day.date, count: day.count, level: day.level as MonoChartContribution['level'] })
  }
  const counts = new Map<string, number>()
  for (const event of events) {
    if (!event || typeof event !== 'object' || event.type !== 'PushEvent') continue
    const repo: unknown = event.repo
    if (!repo || typeof repo !== 'object' || !('name' in repo) || typeof repo.name !== 'string') continue
    const payload: unknown = event.payload
    const commits = payload && typeof payload === 'object' && 'commits' in payload && Array.isArray(payload.commits) ? payload.commits.length : 1
    counts.set(repo.name, (counts.get(repo.name) ?? 0) + commits)
  }
  const repos: MonoChartRepo[] = [...counts.entries()].sort(([, a], [, b]) => b - a).slice(0, 3).map(([name, count]) => ({
    name, count, href: `https://github.com/${name.split('/').map(encodeURIComponent).join('/')}`,
    logo: `https://github.com/${encodeURIComponent(name.split('/')[0] ?? username)}.png?size=64`,
  }))
  const sunday = contributions.findIndex(day => new Date(`${day.date}T00:00:00Z`).getUTCDay() === 0)
  return { contributions: contributions.slice(sunday < 0 ? 0 : sunday), repos }
}
