import { fixedColor, PET_BASE_COLOR, PET_MOOD_HUE, PET_POISON_COLOR, tintColor } from './pet-color'

export const PET_STORAGE_KEY = 'tuff.miko.pet.v1'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const POISON_MS = 15 * MINUTE
const SWIM_PALE_MS = 10 * MINUTE
const SWIM_PALE_SHIFT = 0.12
const HUNGER_PER_HOUR = 0.04
const HUNGER_CAP = 0.15
const ACTIVE_WINDOW_MS = MINUTE
const IDLE_DECAY_MS = 10 * MINUTE

export interface PetEggs {
  tan: number
  lastTanAt: number
  poisonUntil: number
  swimUntil: number
  swimPaleUntil: number
  rainbowUntil: number
  moodUntil: number
  lastMealSlot: number
  hungrySince: number
  fishEaten: number
  installedAt: number
  bestScore: number
  overworkDay: string
  affection: number
  coffeeDay: string
}

export interface PetEggContext {
  now: number
  sessionStart: number
  idleMs: number
}

export type PetEggEvent =
  | { kind: 'ate' }
  | { kind: 'poisoned' }
  | { kind: 'hungry' }
  | { kind: 'sunny' }

export interface PetVisual {
  color: string
  poisoned: boolean
  rainbow: boolean
  mood: boolean
  swimming: boolean
  hungry: boolean
  pale: number
  sunny: boolean
  holiday: boolean
}

export function latestMealSlot(now: number): number {
  const d = new Date(now)
  const at = (hour: number, dayOffset = 0) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate() + dayOffset, hour).getTime()
  return Math.max(...[at(18, -1), at(12), at(18)].filter((slot) => slot <= now))
}

export function createEggs(now: number): PetEggs {
  return {
    tan: 0,
    lastTanAt: now,
    poisonUntil: 0,
    swimUntil: 0,
    swimPaleUntil: 0,
    rainbowUntil: 0,
    moodUntil: 0,
    lastMealSlot: latestMealSlot(now),
    hungrySince: 0,
    fishEaten: 0,
    installedAt: now,
    bestScore: 0,
    overworkDay: '',
    affection: 0,
    coffeeDay: ''
  }
}

export function loadEggs(now: number, storage: Storage | null): PetEggs {
  const base = createEggs(now)
  try {
    const raw = storage?.getItem(PET_STORAGE_KEY)
    if (!raw) return base
    const saved = JSON.parse(raw) as Partial<PetEggs>
    const merged = { ...base, ...saved, lastTanAt: now }
    Reflect.deleteProperty(merged, 'enabled')
    return merged
  } catch {
    return base
  }
}

export function saveEggs(eggs: PetEggs, storage: Storage | null): void {
  try {
    storage?.setItem(PET_STORAGE_KEY, JSON.stringify(eggs))
  } catch {
    // Storage is best effort; the pet keeps its state in memory.
  }
}

export function tickEggs(
  eggs: PetEggs,
  ctx: PetEggContext
): { eggs: PetEggs; events: PetEggEvent[] } {
  const next: PetEggs = { ...eggs }
  const events: PetEggEvent[] = []
  const minutes = Math.max(0, ctx.now - next.lastTanAt) / MINUTE
  next.lastTanAt = ctx.now
  const hour = new Date(ctx.now).getHours()
  const active = ctx.idleMs < ACTIVE_WINDOW_MS

  if (active && hour >= 8 && hour < 18) {
    const before = next.tan
    next.tan = Math.min(100, next.tan + minutes)
    if (before < 50 && next.tan >= 50) events.push({ kind: 'sunny' })
  } else if (hour >= 21 || hour < 6 || ctx.idleMs > IDLE_DECAY_MS) {
    next.tan = Math.max(0, next.tan - 0.5 * minutes)
  }

  const slot = latestMealSlot(ctx.now)
  if (slot > next.lastMealSlot) {
    if (slot >= ctx.sessionStart) {
      next.lastMealSlot = slot
      next.hungrySince = 0
      next.fishEaten += 1
      events.push({ kind: 'ate' })
      if (Math.random() < 0.2) {
        next.poisonUntil = ctx.now + POISON_MS
        events.push({ kind: 'poisoned' })
      }
    } else if (next.hungrySince === 0) {
      next.hungrySince = slot
      events.push({ kind: 'hungry' })
    }
  }

  return { eggs: next, events }
}

export function holidayColor(now: number): string | null {
  const d = new Date(now)
  const month = d.getMonth() + 1
  const day = d.getDate()
  if (month === 12 && day === 24) return fixedColor(0.6, 0.2, 25)
  if (month === 12 && day === 25) return fixedColor(0.62, 0.18, 150)
  if (month === 10 && day === 31) return fixedColor(0.72, 0.17, 55)
  if (month === 1 && day === 1) return fixedColor(0.8, 0.13, 85)
  return null
}

export function resolveVisual(
  eggs: PetEggs,
  now: number,
  base: string = PET_BASE_COLOR
): PetVisual {
  const poisoned = now < eggs.poisonUntil
  const rainbow = now < eggs.rainbowUntil
  const mood = now < eggs.moodUntil
  const swimming = now < eggs.swimUntil
  const hungry = eggs.hungrySince > 0
  const hunger = hungry
    ? Math.min(HUNGER_CAP, ((now - eggs.hungrySince) / HOUR) * HUNGER_PER_HOUR)
    : 0
  const swimPale = Math.max(0, (eggs.swimPaleUntil - now) / SWIM_PALE_MS) * SWIM_PALE_SHIFT
  const pale = Math.max(hunger, swimPale)
  const holiday = holidayColor(now)
  const monday = new Date(now).getDay() === 1 ? -0.02 : 0

  let color: string
  if (poisoned) {
    color = fixedColor(PET_POISON_COLOR.l, PET_POISON_COLOR.c, PET_POISON_COLOR.h)
  } else {
    const seed = holiday ?? base
    const moodTint = mood ? { hue: PET_MOOD_HUE, hueMix: 0.35, lift: 0.02 } : {}
    color = tintColor(seed, {
      ...moodTint,
      lift: (moodTint.lift ?? 0) - 0.1 * (eggs.tan / 100) + pale + monday,
      chroma: Math.max(0.3, 1 - 2 * pale)
    })
  }

  return {
    color,
    poisoned,
    rainbow,
    mood,
    swimming,
    hungry,
    pale,
    sunny: eggs.tan >= 50,
    holiday: holiday !== null
  }
}
