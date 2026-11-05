import type { PetEggEvent, PetEggs } from './pet-eggs'
import type { BreakoutState, Brick, JuggleState, PetGame } from './pet-games'
import type { PetAction, PetPose, PlayField } from './pet-motion'
import type { PetSurface } from './pet-physics'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, onScopeDispose, reactive, ref, shallowRef } from 'vue'
import { mixHex } from './pet-color'
import { createEggs, loadEggs, resolveVisual, saveEggs, tickEggs } from './pet-eggs'
import {
  BALL_RADIUS,
  bumpJuggle,
  chooseGame,
  createBreakout,
  createJuggle,
  GAME_FLIGHT_MS,
  GAME_ZEROG_MS,
  PADDLE_HALF,
  stepBreakout,
  stepJuggle
} from './pet-games'
import { matchPetKeywords } from './pet-keywords'
import { buildField, pickAction, poseOf, positionOf, weightActions } from './pet-motion'
import {
  centreX,
  classifyFall,
  FOOT_PAD,
  PET_SIZE,
  PET_WIDTH,
  planJump,
  reboundVelocity,
  standTop,
  stepAir,
  stepWalk,
  surfaceUnder
} from './pet-physics'

type Translate = (key: string, named?: Record<string, unknown>) => string

type PetMode = 'stand' | 'air' | 'drag' | 'climb' | 'ledge' | 'game'

interface ReactionStage {
  pose: PetPose
  ms: number
  flat?: boolean
}

export interface PetHost {
  stage: () => HTMLElement | null
  body: () => HTMLElement | null
  box: () => HTMLElement | null
  input: () => HTMLTextAreaElement | null
  empty: () => boolean
  head: () => HTMLElement | null
}

const STEP = 1 / 60
const BEAT_MS = 200
const TRIPLE_MS = 700
const LONG_PRESS_MS = 600
const DRAG_PX = 6
const WALL_SNAP = 24
const CLIMB_MS = 3000
const CLIMB_SPEED = 120
const LEDGE_SPEED = 170
const RECOVER_DELAY_MS = 1000
const RECOVER_WALK_SPEED = 180
const REANCHOR_SPEED = 180
const COLOR_EASE_MS = 1500
const TYPING_BREAK_MS = 5 * 60 * 1000
const OVERWORK_MS = 2 * 60 * 60 * 1000
const PADDLE_GAP = 16
const IDLE_FRAME_MS = 66
const HEAD_GAP = 8
const MIN_BAND = 90
const PRINT_STEP = 16
const PRINT_TTL = 1500
const TRAIL_EVERY = 90
const MOVING_POSES: ReadonlySet<PetPose> = new Set<PetPose>([
  'climb',
  'fall',
  'hang',
  'wince',
  'dizzy',
  'flat',
  'fly',
  'zerog',
  'juggle',
  'ball'
])

const STILL_ACTIONS: ReadonlySet<PetAction> = new Set<PetAction>([
  'sit',
  'sleep',
  'stretch',
  'bathe',
  'curious',
  'shake',
  'sneeze'
])

export function usePetController(host: PetHost, t: Translate, reduced: () => boolean) {
  const el = ref<HTMLElement | null>(null)
  const shadow = ref<HTMLElement | null>(null)
  const pose = ref<PetPose>('sit')
  const color = ref('#9726D9')
  const bubble = ref<string | null>(null)
  const dragging = ref(false)
  const game = ref<PetGame | null>(null)
  const bricks = shallowRef<Brick[]>([])
  const paddleX = ref(0)
  const paddleTop = ref(0)
  const score = ref(0)
  const lives = ref(3)
  const best = ref(0)
  const tints = reactive({
    rainbow: false,
    poisoned: false,
    swimming: false,
    hungry: false,
    sunny: false,
    holiday: false,
    mood: false,
    pale: 0,
    sparkle: false,
    shake: false,
    purr: false,
    wings: false,
    flat: false,
    fading: false,
    puff: false,
    paperHat: false
  })
  const eggs = ref<PetEggs>(createEggs(Date.now()))
  const fishCount = computed(() => eggs.value.fishEaten)
  const tanPercent = computed(() => Math.round(eggs.value.tan))
  const heart = ref(0)

  const rects = {
    stage: null as DOMRect | null,
    body: null as DOMRect | null,
    box: null as DOMRect | null
  }
  let field: PlayField | null = null
  let running = false
  let suspended = false
  let spawned = false
  let raf = 0
  let last = 0
  let acc = 0
  let beatAcc = 0
  let lastRead = 0
  let needRead = true
  let x = 0
  let y = 0
  let vx = 0
  let vy = 0
  let facing: 1 | -1 = 1
  let angle = 0
  let squashX = 1
  let squashY = 1
  let mode: PetMode = 'air'
  let surface: PetSurface | null = null
  let peakTop = 0
  let voluntary = false
  let walkDir: 1 | -1 = 1
  let walkUntil = 0
  let walkSpeed = 70
  let decideAt = 0
  let poseUntil = 0
  let dizzyUntil = 0
  let belly = false
  let bellyAngle = 0
  let bellyTarget = 0
  let lastBellyAt = 0
  let rainbowUntil = 0
  let swimUntil = 0
  let clicks: number[] = []
  let wallUp = false
  let recovering = false
  let climbTarget: number | null = null
  let ledgeDir: 1 | -1 = 1
  let ledgeUntil = 0
  const petStamps: number[] = []
  const boxStamps: number[] = []
  const prints = shallowRef<Array<{ id: number; x: number; y: number; t: number; c?: string }>>([])
  let printId = 0
  let printDistance = 0
  let trailAt = 0
  let idleTimer = 0
  let lastShadow = ''
  let lastTransform = ''
  let lastPose = ''
  let pendingDouble = 0
  let disposed = false
  let reactionStages: ReactionStage[] = []
  let reactionUntil = 0
  let suppressClick = false
  let press: { px: number; py: number; moved: boolean; timer: number } | null = null
  let samples: Array<{ x: number; y: number; t: number }> = []
  let pointer = { x: 0, y: 0 }
  let colorFrom = '#9726D9'
  let colorTo = '#9726D9'
  let colorAt = 0
  let breakout: BreakoutState | null = null
  let juggle: JuggleState | null = null
  let gameUntil = 0
  let climbUntil = 0
  let needs = { energy: 0.7, boredom: 0.2, curiosity: 0.4 }
  let lastSave = 0
  let lastActivity = Date.now()
  let lastInput = 0
  let streakStart = 0
  let overworkDone = false
  let sessionStart = Date.now()
  const observers: ResizeObserver[] = []
  const storage = hasWindow() ? window.localStorage : null

  function persist(): void {
    saveEggs(eggs.value, storage)
  }

  function setPose(next: PetPose, ms = 0): void {
    pose.value = next
    poseUntil = ms > 0 ? performance.now() + ms : 0
    if (belly && MOVING_POSES.has(next)) setBelly(false)
  }

  function setMode(next: PetMode): void {
    mode = next
    if (next === 'drag' || next === 'game') recovering = false
    if (next !== 'stand' && belly) setBelly(false)
  }

  function say(text: string | null, ms = 2500): void {
    bubble.value = text
    if (text) {
      window.setTimeout(() => {
        if (bubble.value === text) bubble.value = null
      }, ms)
    }
  }

  function addPrint(px: number, py: number, c?: string): void {
    printId += 1
    const next = [...prints.value, { id: printId, x: px, y: py, t: Date.now(), c }]
    prints.value = next.length > 40 ? next.slice(-40) : next
  }

  function breakoutBand(): { top: number; bottom: number } | null {
    if (!field || !rects.stage || !host.empty()) return null
    const head = host.head()?.getBoundingClientRect()
    if (!head) return null
    const top = field.bounds.top + HEAD_GAP
    const bottom = head.top - rects.stage.top - HEAD_GAP
    return bottom - top >= MIN_BAND ? { top, bottom } : null
  }

  function flashTint(key: 'shake' | 'flat' | 'puff', ms: number): void {
    tints[key] = true
    window.setTimeout(() => {
      tints[key] = false
    }, ms)
  }

  function readRects(): void {
    rects.stage = host.stage()?.getBoundingClientRect() ?? null
    rects.body = host.body()?.getBoundingClientRect() ?? null
    rects.box = host.box()?.getBoundingClientRect() ?? null
    const stage = rects.stage
    const body = rects.body
    field =
      stage && body && body.width > 0 && body.height > 0 ? buildField(stage, body, rects.box) : null
    lastRead = performance.now()
    needRead = false
  }

  function clampX(value: number): number {
    if (!field) return value
    return Math.min(field.bounds.right - PET_WIDTH, Math.max(field.bounds.left, value))
  }

  function eggEvent(event: PetEggEvent): void {
    if (event.kind === 'ate') setPose('eat', 4000)
    else if (event.kind === 'poisoned') say(t('home.pet.bubble.poisoned'))
    else if (event.kind === 'hungry') say(t('home.pet.bubble.hungry'))
    else if (event.kind === 'sunny') say(t('home.pet.bubble.sunny'))
  }

  function beat(): void {
    const tNow = Date.now()
    const perf = performance.now()
    const result = tickEggs(eggs.value, { now: tNow, sessionStart, idleMs: tNow - lastActivity })
    eggs.value = result.eggs
    result.events.forEach(eggEvent)
    const visual = resolveVisual(eggs.value, tNow)
    rainbowUntil = Math.max(rainbowUntil, 0)
    Object.assign(tints, {
      rainbow: perf < rainbowUntil,
      poisoned: visual.poisoned,
      swimming: tNow < swimUntil,
      hungry: visual.hungry,
      sunny: visual.sunny,
      holiday: visual.holiday,
      mood: visual.mood,
      pale: visual.pale
    })
    const today = new Date(tNow)
    const install = new Date(eggs.value.installedAt)
    tints.paperHat =
      today.getMonth() === install.getMonth() &&
      today.getDate() === install.getDate() &&
      today.getFullYear() > install.getFullYear()
    if (game.value === 'breakout' && !host.empty()) finishGame('stage')
    if (prints.value.some((p) => tNow - p.t >= PRINT_TTL))
      prints.value = prints.value.filter((p) => tNow - p.t < PRINT_TTL)
    if (
      mode === 'stand' &&
      !game.value &&
      today.getHours() === 15 &&
      eggs.value.coffeeDay !== today.toDateString()
    ) {
      eggs.value = { ...eggs.value, coffeeDay: today.toDateString() }
      setPose('coffee', 6000)
    }
    if (visual.color !== colorTo) {
      colorFrom = color.value
      colorTo = visual.color
      colorAt = perf
    }
    const k = Math.min(1, (perf - colorAt) / COLOR_EASE_MS)
    color.value = k >= 1 ? colorTo : mixHex(colorFrom, colorTo, k)
    needs = {
      energy: Math.min(1, Math.max(0, needs.energy + (pose.value === 'walk' ? -0.02 : 0.02))),
      boredom: Math.min(
        1,
        Math.max(0, needs.boredom + (tNow - lastActivity > 30_000 ? 0.01 : -0.02))
      ),
      curiosity: Math.min(1, Math.max(0, needs.curiosity + (Math.random() - 0.5) * 0.06))
    }
    if (tNow - lastSave > 60_000) {
      lastSave = tNow
      persist()
    }
    if (poseUntil > 0 && perf >= poseUntil && game.value === null && perf >= reactionUntil) {
      poseUntil = 0
      setPose('sit')
    }
  }

  function finishGame(reason: 'over' | 'won' | 'typing' | 'escape' | 'stage'): void {
    const kind = game.value
    game.value = null
    if (kind === 'breakout' && breakout) {
      best.value = Math.max(best.value, breakout.score)
      eggs.value = { ...eggs.value, bestScore: best.value }
      persist()
    }
    breakout = null
    juggle = null
    bricks.value = []
    tints.wings = false
    tints.sparkle = reason === 'won'
    if (reason === 'won' || reason === 'over')
      say(t(reason === 'won' ? 'home.pet.bubble.win' : 'home.pet.bubble.over'))
    if (reason === 'won')
      window.setTimeout(() => {
        tints.sparkle = false
      }, 10_000)
    setMode('air')
    voluntary = true
    vx = 0
    vy = 0
    peakTop = y
    setPose('sit')
  }

  function startGame(): void {
    if (game.value || !field) return
    if (reduced()) {
      say(t('home.pet.bubble.reduced'))
      return
    }
    const composer = field.composer
    let kind = chooseGame(performance.now() < dizzyUntil, Math.random())
    const band = breakoutBand()
    if (kind === 'breakout' && (!composer || !band)) kind = 'zerog'
    if (kind === 'juggling' && mode !== 'stand') kind = 'flight'
    game.value = kind
    score.value = 0
    say(t('home.pet.bubble.start'))
    if (kind === 'breakout' && composer && band) {
      const bounds = field.bounds
      const boxTop = composer.y + 1
      paddleX.value = Math.max(
        bounds.left + PADDLE_HALF,
        Math.min(bounds.right - PADDLE_HALF, pointer.x)
      )
      breakout = createBreakout(
        { left: bounds.left + 8, top: band.top, right: bounds.right - 8, bottom: band.bottom },
        paddleX.value,
        boxTop - PADDLE_GAP
      )
      lives.value = breakout.lives
      bricks.value = breakout.bricks
      setMode('game')
      setPose('ball')
    } else if (kind === 'juggling') {
      juggle = createJuggle()
      setPose('juggle')
    } else if (kind === 'flight') {
      setMode('game')
      gameUntil = performance.now() + GAME_FLIGHT_MS
      tints.wings = true
      setPose('fly')
    } else {
      setMode('game')
      gameUntil = performance.now() + GAME_ZEROG_MS
      vx = (Math.random() - 0.5) * 80
      vy = (Math.random() - 0.5) * 60
      setPose('zerog')
    }
  }

  function stepGame(dt: number): boolean {
    if (!game.value || !field) return false
    const bounds = field.bounds
    const perf = performance.now()
    if (game.value === 'breakout' && breakout) {
      const composer = field.composer
      if (!composer) {
        finishGame('typing')
        return true
      }
      const paddleY = composer.y + 1 - PADDLE_GAP
      paddleTop.value = paddleY
      paddleX.value = Math.max(
        bounds.left + PADDLE_HALF,
        Math.min(bounds.right - PADDLE_HALF, pointer.x)
      )
      const tick = stepBreakout(
        breakout,
        dt,
        { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom },
        paddleX.value,
        paddleY
      )
      breakout = tick.state
      if (tick.brokeBrick) bricks.value = breakout.bricks
      if (breakout.combo >= 10) rainbowUntil = perf + 12_000
      if (tick.lost) say(t('home.pet.bubble.drop'), 1200)
      lives.value = breakout.lives
      score.value = breakout.score
      x = breakout.ball.x - PET_WIDTH / 2
      y = breakout.ball.y - PET_SIZE / 2
      angle += ((breakout.ball.vx * dt) / BALL_RADIUS) * (180 / Math.PI)
      if (breakout.won) finishGame('won')
      else if (breakout.over) finishGame('over')
      return true
    }
    if (game.value === 'juggling' && juggle) {
      juggle = stepJuggle(juggle, dt * 1000)
      score.value = juggle.score
      if (juggle.over) finishGame('over')
      return true
    }
    if (perf > gameUntil) {
      if (game.value === 'flight') {
        game.value = null
        tints.wings = false
      }
      finishGame('typing')
      return true
    }
    if (game.value === 'flight') {
      const cx = centreX(x)
      const cy = y + PET_SIZE / 2
      const k = Math.min(1, dt * 4)
      x = clampX(x + (pointer.x - cx) * k)
      y = Math.max(bounds.top, Math.min(bounds.bottom - PET_SIZE, y + (pointer.y - cy) * k))
      facing = pointer.x >= cx ? 1 : -1
      if (performance.now() >= trailAt) {
        trailAt = performance.now() + TRAIL_EVERY
        addPrint(cx, cy, color.value)
      }
      return true
    }
    if (game.value === 'zerog') {
      x += vx * dt
      y += vy * dt
      if (x < bounds.left || x + PET_WIDTH > bounds.right) {
        vx = -vx * 0.8
        x = Math.max(bounds.left, Math.min(bounds.right - PET_WIDTH, x))
      }
      if (y < bounds.top || y + PET_SIZE > bounds.bottom) {
        vy = -vy * 0.8
        y = Math.max(bounds.top, Math.min(bounds.bottom - PET_SIZE, y))
      }
      return true
    }
    return true
  }

  /** Where a standing pet's centre should be after a layout move: back on the composer span, or off the zone. */
  function reanchorTarget(surface: PetSurface, cx: number): number {
    if (surface.id === 'composer') return Math.min(surface.x1, Math.max(surface.x0, cx))
    const zone = field?.zone
    if (!zone || cx <= zone.x0 + 0.5 || cx >= zone.x1 - 0.5) return cx
    const toLeft = zone.x0 >= surface.x0 ? cx - zone.x0 : Infinity
    const toRight = zone.x1 <= surface.x1 ? zone.x1 - cx : Infinity
    if (toLeft === Infinity && toRight === Infinity) return cx
    return toLeft <= toRight ? zone.x0 : zone.x1
  }

  function floorLane(cx: number): { lo: number; hi: number; side: 'left' | 'right' | null } | null {
    const floor = field?.surfaces.find((s) => s.id === 'floor')
    if (!field || !floor) return null
    const zone = field.zone
    if (!zone) return { lo: floor.x0, hi: floor.x1, side: null }
    if (cx <= zone.x0 + 0.5) return { lo: floor.x0, hi: Math.min(zone.x0, floor.x1), side: 'left' }
    if (cx >= zone.x1 - 0.5) return { lo: Math.max(zone.x1, floor.x0), hi: floor.x1, side: 'right' }
    return null
  }

  function startWallClimb(): void {
    const composer = field?.composer
    if (!field || !composer) return
    const toLeft = walkDir === -1
    wallUp = false
    setMode('climb')
    x = toLeft ? field.bounds.left : field.bounds.right - PET_WIDTH
    facing = toLeft ? 1 : -1
    climbTarget = standTop(composer)
    climbUntil = performance.now() + 9000
    setPose('climb')
  }

  function reactToFall(height: number): void {
    const tier = classifyFall(height)
    const stages: ReactionStage[] =
      tier === 'wince'
        ? [{ pose: 'wince', ms: 800 }]
        : tier === 'dizzy'
          ? [{ pose: 'dizzy', ms: 3200 }]
          : tier === 'flat'
            ? [
                { pose: 'flat', ms: 1500, flat: true },
                { pose: 'dizzy', ms: 2000 }
              ]
            : []
    if (stages.length === 0) return
    if (stages.some((stage) => stage.pose === 'dizzy'))
      dizzyUntil = performance.now() + stages.reduce((sum, stage) => sum + stage.ms, 0)
    reactionStages = stages.slice(1)
    startStage(stages[0])
  }

  function startStage(stage: ReactionStage): void {
    setPose(stage.pose, stage.ms)
    tints.flat = stage.flat === true
    reactionUntil = performance.now() + stage.ms
  }

  function advanceReaction(perf: number): void {
    if (perf < reactionUntil) return
    const next = reactionStages.shift()
    if (next) startStage(next)
    else tints.flat = false
  }

  function step(dt: number): void {
    if (!field || mode === 'drag') return
    const perf = performance.now()
    advanceReaction(perf)
    if (mode === 'game' || game.value === 'juggling') {
      if (stepGame(dt)) return
    }
    if (mode === 'climb') {
      if (perf > climbUntil) {
        setMode('air')
        voluntary = true
        vx = 0
        vy = 0
        peakTop = y
        return
      }
      if (climbTarget !== null && y <= climbTarget) {
        const composer = field.composer
        const centre = composer ? (composer.x0 + composer.x1) / 2 : 0
        setMode('ledge')
        ledgeDir = centreX(x) < centre ? 1 : -1
        ledgeUntil = perf + 9000
        y = climbTarget
        climbTarget = null
        setPose('walk')
        return
      }
      if (climbTarget === null && y <= field.bounds.top) {
        setMode('air')
        voluntary = true
        vx = 0
        vy = 0
        peakTop = y
        return
      }
      y -= CLIMB_SPEED * dt
      return
    }
    if (mode === 'ledge') {
      const composer = field.composer
      if (!composer || perf > ledgeUntil) {
        setMode('air')
        voluntary = Boolean(composer)
        vx = 0
        vy = 0
        peakTop = y
        return
      }
      x = clampX(x + ledgeDir * LEDGE_SPEED * dt)
      y = standTop(composer)
      if (surfaceUnder({ x, y, vx, vy }, [composer])) {
        setMode('stand')
        surface = composer
        recovering = false
        setPose('sit')
        decideAt = perf + 1200
      }
      return
    }
    if (mode === 'stand' && surface) {
      const id = surface.id
      const current = field.surfaces.find((s) => s.id === id)
      if (!current) {
        setMode('air')
        voluntary = false
        vx = 0
        vy = 0
        peakTop = y
        return
      }
      surface = current
      y = standTop(surface)
      const cx = centreX(x)
      const target = reanchorTarget(surface, cx)
      if (target !== cx) {
        if (belly) {
          x = target - PET_WIDTH / 2
        } else {
          if (pose.value !== 'walk') setPose('walk')
          const gap = target - cx
          const step = REANCHOR_SPEED * dt
          x = (Math.abs(gap) <= step ? target : cx + Math.sign(gap) * step) - PET_WIDTH / 2
        }
        return
      }
      if (pose.value === 'walk' || recovering) {
        if (perf > walkUntil) {
          recovering = false
          setPose('sit')
          return
        }
        const lane = surface.id === 'floor' ? floorLane(centreX(x)) : null
        if (surface.id === 'floor' && (!lane || lane.hi <= lane.lo)) {
          setPose('sit')
          return
        }
        const res = stepWalk(
          x,
          walkDir,
          walkSpeed,
          dt,
          lane ? { ...surface, x0: lane.lo, x1: lane.hi } : surface
        )
        if (surface.id === 'composer') {
          printDistance += Math.abs(res.x - x)
          if (printDistance >= PRINT_STEP) {
            printDistance = 0
            addPrint(centreX(res.x) - 6, surface.y - 2)
          }
        }
        x = res.x
        y = standTop(surface)
        if (res.atEdge) {
          const outer =
            (lane?.side === 'left' && walkDir === -1) || (lane?.side === 'right' && walkDir === 1)
          if (wallUp && outer) {
            startWallClimb()
            return
          }
          walkDir = walkDir === 1 ? -1 : 1
          facing = walkDir
        }
        return
      }
      if (perf >= decideAt) decide(Date.now(), perf)
      return
    }
    const res = stepAir({ x, y, vx, vy }, peakTop, dt, field.bounds, field.surfaces)
    x = res.body.x
    y = res.body.y
    vx = res.body.vx
    vy = res.body.vy
    peakTop = res.peakTop
    if (res.bumped !== 0) squashX = 0.85
    if (res.landed) land(res.landed, res.body.y, res.fallHeight, res.body.vy)
    const floor = field.surfaces.find((s) => s.id === 'floor')
    if (floor && !res.landed && y > standTop(floor) + 1) {
      const top = standTop(floor)
      const fallHeight = Math.max(0, top - Math.min(peakTop, y))
      x = clampX(x)
      land(floor, top, fallHeight, reboundVelocity(vy))
    }
  }

  function land(target: PetSurface, top: number, fallHeight: number, rebound: number): void {
    y = top
    peakTop = top
    surface = target
    squashY = 0.85
    if (!voluntary && fallHeight > 0) reactToFall(fallHeight)
    if (rebound < 0) {
      vy = rebound
      voluntary = true
      return
    }
    vx = 0
    vy = 0
    setMode('stand')
    voluntary = false
    if (target.id === 'composer') recovering = false
    decideAt =
      performance.now() + (field?.composer && target.id === 'floor' ? RECOVER_DELAY_MS : 800)
    if (pose.value === 'fall' || pose.value === 'stretch') setPose('sit')
  }

  function recoverFromFloor(perf: number): void {
    if (belly) {
      decideAt = perf + 500
      return
    }
    const composer = field?.composer
    const floor = field?.surfaces.find((s) => s.id === 'floor')
    if (!field || !composer || !floor) return
    const target = composer.x0 + Math.random() * (composer.x1 - composer.x0)
    const jump = planJump(floor, composer, x, target)
    if (jump) {
      vx = jump.vx
      vy = jump.vy
      setMode('air')
      voluntary = true
      peakTop = y
      setPose('stretch', 600)
      return
    }
    const lane = floorLane(centreX(x))
    if (!lane || !lane.side || lane.hi - lane.lo < PET_WIDTH) {
      decideAt = perf + 500
      return
    }
    wallUp = true
    recovering = true
    walkDir = lane.side === 'left' ? -1 : 1
    facing = walkDir
    walkSpeed = RECOVER_WALK_SPEED
    walkUntil = perf + 9000
    decideAt = perf + 9000
  }

  function decide(tNow: number, perf: number): void {
    if (!field || !surface) return
    if (surface.id === 'floor' && field.composer) {
      recoverFromFloor(perf)
      return
    }
    if (reactionStages.length > 0 || perf < reactionUntil) {
      decideAt = Math.max(reactionUntil, perf + 50)
      return
    }
    if ((pose.value === 'box' || pose.value === 'coffee') && perf < poseUntil) {
      decideAt = poseUntil
      return
    }
    decideAt = perf + 2500 + Math.random() * 3000
    const hour = new Date(tNow).getHours()
    const composer = field.composer
    const floor = field.surfaces.find((s) => s.id === 'floor')
    const onComposer = surface.id === 'composer'
    const lane = onComposer ? null : floorLane(centreX(x))
    const laneUsable = !!lane && lane.hi > lane.lo
    const target = composer ? composer.x0 + Math.random() * (composer.x1 - composer.x0) : 0
    const reachable = !!composer && !!floor && !!planJump(floor, composer, x, target)
    const canJumpUp = !onComposer && reachable
    const canClimbUp =
      !onComposer && !!composer && !reachable && !!lane && lane.hi - lane.lo >= PET_WIDTH
    let options = weightActions(needs, {
      canJumpUp,
      canClimbUp,
      night: hour >= 23 || hour < 6,
      morning: hour >= 6 && hour < 10,
      friday: new Date(tNow).getDay() === 5
    })
    if (belly) options = options.filter(([a]) => STILL_ACTIONS.has(a))
    if (!onComposer && !laneUsable) {
      options = options.filter(([a]) => a === 'jump-up' || a === 'wall-up')
      if (options.length === 0) return
    }
    const action: PetAction = pickAction(options, Math.random())
    if (action !== 'wall-up') wallUp = false
    if (action === 'patrol') {
      walkDir = Math.random() < 0.5 ? -1 : 1
      if (
        eggs.value.affection > 0.3 &&
        Math.abs(pointer.x - centreX(x)) < 320 &&
        Math.random() < eggs.value.affection
      )
        walkDir = pointer.x > centreX(x) ? 1 : -1
      facing = walkDir
      walkSpeed = (60 + Math.random() * 30) * (new Date(tNow).getDay() === 1 ? 0.8 : 1)
      walkUntil = perf + 2000 + Math.random() * 3000
      setPose('walk')
    } else if (action === 'sit') {
      setPose('sit')
    } else if (action === 'sleep') {
      setPose('sleep')
      decideAt = perf + 8000 + Math.random() * 8000
    } else if (action === 'stretch') {
      setPose('stretch', 2000)
    } else if (action === 'bathe') {
      setPose('bathe', 3000)
    } else if (action === 'curious') {
      setPose('curious', 2000)
    } else if (action === 'sneeze') {
      setPose('curious', 900)
      flashTint('puff', 900)
    } else if (action === 'hop') {
      setMode('air')
      voluntary = true
      vx = 0
      vy = -260
      peakTop = y
      setPose('stretch', 500)
    } else if (action === 'shake') {
      flashTint('shake', 800)
    } else if (action === 'wall-up' && floor) {
      const toLeft = lane?.side === 'left'
      wallUp = true
      walkDir = toLeft ? -1 : 1
      facing = walkDir
      walkSpeed = 80
      walkUntil = perf + 9000
      setPose('walk')
    } else if (action === 'jump-up' && composer && floor) {
      const plan = planJump(floor, composer, x, target)
      if (plan) {
        vx = plan.vx
        vy = plan.vy
        setMode('air')
        voluntary = true
        peakTop = y
        setPose('stretch', 600)
      }
    }
  }

  function reducedTick(perf: number): void {
    if (!field || !surface || perf < decideAt) return
    decideAt = perf + 12_000
    const range = surface.x1 - surface.x0 - PET_WIDTH
    const nextX = surface.x0 + Math.random() * Math.max(0, range)
    tints.fading = true
    window.setTimeout(() => {
      x = clampX(nextX)
      y = standTop(surface!)
      tints.fading = false
    }, 300)
    setPose(Math.random() < 0.5 ? 'sit' : 'sleep')
  }

  function isMoving(): boolean {
    return (
      mode !== 'stand' ||
      game.value !== null ||
      dragging.value ||
      pose.value === 'walk' ||
      recovering ||
      squashX < 0.995 ||
      squashY < 0.995 ||
      bellyAngle !== bellyTarget ||
      tints.shake ||
      tints.purr ||
      tints.fading ||
      tints.puff ||
      prints.value.length > 0
    )
  }

  function schedule(): void {
    if (!running) return
    if (isMoving()) {
      raf = requestAnimationFrame(frame)
      return
    }
    idleTimer = window.setTimeout(() => {
      raf = requestAnimationFrame(frame)
    }, IDLE_FRAME_MS)
  }

  function frame(ts: number): void {
    if (!running) return
    const dtReal = Math.min(0.1, (ts - last) / 1000)
    last = ts
    if (reduced()) {
      beatAcc += dtReal * 1000
      if (beatAcc >= BEAT_MS || needRead) {
        beatAcc = 0
        if (needRead || performance.now() - lastRead >= BEAT_MS) readRects()
        beat()
        reducedTick(performance.now())
      }
    } else {
      acc += dtReal
      beatAcc += dtReal * 1000
      while (acc >= STEP) {
        step(STEP)
        acc -= STEP
      }
      if (beatAcc >= BEAT_MS || needRead) {
        beatAcc = 0
        if (needRead || performance.now() - lastRead >= BEAT_MS) readRects()
        beat()
      }
    }
    write()
    schedule()
  }

  function write(): void {
    const node = el.value
    if (!node || !field) return
    stepBelly()
    const climbing = mode === 'climb' ? 90 * facing : 0
    const position = positionOf(x, y)
    if (position !== lastTransform) {
      node.style.transform = position
      lastTransform = position
    }
    const poseCss = poseOf({
      facing,
      angle: game.value === 'breakout' ? angle : climbing + bellyAngle,
      sx: squashX,
      sy: squashY
    })
    if (poseCss !== lastPose) {
      node.style.setProperty('--pet-pose', poseCss)
      lastPose = poseCss
    }
    squashX += (1 - squashX) * 0.2
    squashY += (1 - squashY) * 0.2
    const shadowNode = shadow.value
    if (shadowNode && surface) {
      const feet = y + PET_SIZE - FOOT_PAD
      const height = Math.max(0, surface.y - feet)
      const scale = Math.max(0.35, 1 - height / 240)
      const shadowStyle = `translate3d(${(centreX(x) - 22).toFixed(1)}px, ${(surface.y - 3).toFixed(1)}px, 0) scale(${scale.toFixed(3)})`
      if (shadowStyle !== lastShadow) {
        shadowNode.style.transform = shadowStyle
        shadowNode.style.opacity = String(0.3 * scale)
        lastShadow = shadowStyle
      }
    }
  }

  function spawn(): void {
    if (!field) return
    const target = field.composer ?? field.surfaces.find((s) => s.id === 'floor')
    if (!target) return
    surface = target
    setMode('stand')
    x = clampX(target.x0 + (target.x1 - target.x0) / 2 - PET_WIDTH / 2)
    y = standTop(target)
    setPose('sit')
    decideAt = performance.now() + 1200
    spawned = true
  }

  function start(): void {
    if (running || suspended) return
    running = true
    last = performance.now()
    sessionStart = Date.now()
    readRects()
    if (!spawned) spawn()
    raf = requestAnimationFrame(frame)
  }

  function stop(): void {
    running = false
    cancelAnimationFrame(raf)
    window.clearTimeout(idleTimer)
    persist()
  }

  function suspend(): void {
    suspended = true
    stop()
  }

  function resume(): void {
    suspended = false
    if (!disposed) start()
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'visible') start()
    else stop()
  }

  function onResize(): void {
    needRead = true
  }

  function touchActivity(): void {
    lastActivity = Date.now()
    lastInput = Date.now()
  }

  function onPointerMove(event: PointerEvent): void {
    const stage = rects.stage
    if (!stage) return
    pointer = { x: event.clientX - stage.left, y: event.clientY - stage.top }
    if (
      press &&
      !press.moved &&
      Math.hypot(event.clientX - press.px, event.clientY - press.py) > DRAG_PX
    ) {
      press.moved = true
      window.clearTimeout(press.timer)
      dragging.value = true
      suppressClick = true
      setMode('drag')
      setPose('hang')
    }
    if (dragging.value) {
      x += (pointer.x - PET_WIDTH / 2 - x) * 0.35
      y += (pointer.y - PET_SIZE / 2 - y) * 0.35
      samples.push({ x: pointer.x, y: pointer.y, t: performance.now() })
      if (samples.length > 6) samples.shift()
    }
    touchActivity()
  }

  function releaseDrag(): void {
    if (!field) return
    const recent = samples.filter((s) => performance.now() - s.t < 100)
    const first = recent[0] ?? samples[0]
    const latest = samples[samples.length - 1]
    if (first && latest) {
      const dt = Math.max(0.016, (latest.t - first.t) / 1000)
      vx = Math.max(-1400, Math.min(1400, (latest.x - first.x) / dt))
      vy = Math.max(-1400, Math.min(1400, (latest.y - first.y) / dt))
    } else {
      vx = 0
      vy = 0
    }
    samples = []
    peakTop = y
    const bounds = field.bounds
    const nearLeft = x - bounds.left < WALL_SNAP
    const nearRight = bounds.right - (x + PET_WIDTH) < WALL_SNAP
    if ((nearLeft || nearRight) && y > bounds.top + 40) {
      x = nearLeft ? bounds.left : bounds.right - PET_WIDTH
      setMode('climb')
      climbUntil = performance.now() + CLIMB_MS
      climbTarget = null
      setPose('climb')
      return
    }
    setMode('air')
    voluntary = false
    setPose('fall')
  }

  function onPointerUp(): void {
    if (!press) return
    window.clearTimeout(press.timer)
    if (dragging.value) {
      releaseDrag()
    } else if (tints.purr) {
      tints.purr = false
      setPose('sit')
    }
    press = null
    dragging.value = false
    if (suppressClick)
      window.setTimeout(() => {
        suppressClick = false
      }, 0)
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || game.value === 'breakout') return
    press = { px: event.clientX, py: event.clientY, moved: false, timer: 0 }
    press.timer = window.setTimeout(() => {
      if (!press || press.moved) return
      tints.purr = true
      setPose('purr')
      suppressClick = true
    }, LONG_PRESS_MS)
    touchActivity()
  }

  function onClick(): void {
    if (suppressClick) {
      suppressClick = false
      return
    }
    touchActivity()
    if (game.value === 'juggling' && juggle) {
      juggle = bumpJuggle(juggle)
      score.value = juggle.score
      return
    }
    if (game.value) return
    registerPet()
    heart.value += 1
    const perf = performance.now()
    clicks = clicks.filter((stamp) => perf - stamp < TRIPLE_MS)
    clicks.push(perf)
    if (clicks.length >= 3) {
      cancelPendingDouble()
      clicks = []
      startGame()
      return
    }
    if (clicks.length === 2) {
      say(t('home.pet.bubble.again'), 900)
      cancelPendingDouble()
      pendingDouble = window.setTimeout(
        () => {
          pendingDouble = 0
          clicks = []
          rollBelly()
        },
        Math.max(0, clicks[0] + TRIPLE_MS - perf)
      )
      return
    }
    if (pose.value !== 'box') setPose('celebrate', 1200)
  }

  function cancelPendingDouble(): void {
    if (pendingDouble) window.clearTimeout(pendingDouble)
    pendingDouble = 0
  }

  function setBelly(on: boolean): void {
    belly = on
    bellyTarget = on ? 180 : 0
    lastBellyAt = performance.now()
  }

  function stepBelly(): void {
    if (bellyAngle === bellyTarget) return
    const nowMs = performance.now()
    if (reduced() || Math.abs(bellyTarget - bellyAngle) < 0.5) {
      bellyAngle = bellyTarget
      return
    }
    const dt = Math.min(0.1, (nowMs - lastBellyAt) / 1000)
    lastBellyAt = nowMs
    bellyAngle += (bellyTarget - bellyAngle) * (1 - Math.exp(-dt / 0.18))
  }

  function rollBelly(): void {
    if (mode !== 'stand') return
    if (!belly && (pose.value === 'walk' || recovering)) {
      recovering = false
      setPose('sit')
    }
    setBelly(!belly)
    if (pose.value !== 'box') setPose('celebrate', 800)
  }

  function registerPet(): void {
    const tNow = Date.now()
    petStamps.push(tNow)
    while (petStamps.length > 0 && tNow - petStamps[0] > 60_000) petStamps.shift()
    if (petStamps.length >= 4) {
      petStamps.length = 0
      eggs.value = { ...eggs.value, moodUntil: tNow + 120_000 }
    }
    eggs.value = { ...eggs.value, affection: Math.min(1, eggs.value.affection + 0.02) }
    boxStamps.push(tNow)
    while (boxStamps.length > 0 && tNow - boxStamps[0] > 10_000) boxStamps.shift()
    if (boxStamps.length >= 6) {
      boxStamps.length = 0
      setPose('box', 12_000)
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && game.value) finishGame('escape')
  }

  function onComposerKeyDown(event: KeyboardEvent): void {
    touchActivity()
    if (game.value && event.key.length === 1) finishGame('typing')
    if (event.key === 'Enter' && !event.shiftKey && host.input()?.value.trim() === '')
      flashTint('shake', 800)
  }

  function onComposerInput(): void {
    touchActivity()
    if (game.value) finishGame('typing')
    const tNow = Date.now()
    if (tNow - lastInput > TYPING_BREAK_MS) streakStart = tNow
    if (!overworkDone && streakStart && tNow - streakStart >= OVERWORK_MS) {
      overworkDone = true
      const day = new Date(tNow).toDateString()
      if (eggs.value.overworkDay !== day) {
        eggs.value = { ...eggs.value, overworkDay: day }
        say(t('home.pet.bubble.water'))
      }
    }
  }

  /** Runs once per send, with the text in memory only; keyword ids are the only thing kept. */
  function notifySend(text: string): void {
    const perf = performance.now()
    for (const hit of matchPetKeywords(text)) {
      if (hit === 'eat') {
        setPose('eat', 4000)
        eggs.value = { ...eggs.value, fishEaten: eggs.value.fishEaten + 1, hungrySince: 0 }
      } else if (hit === 'sleepy') {
        setPose('sleepy', 6000)
      } else if (hit === 'coffee') {
        setPose('coffee', 6000)
      } else if (hit === 'swim') {
        swimUntil = Date.now() + 60_000
        setPose('swim', 8000)
        eggs.value = {
          ...eggs.value,
          swimUntil: Date.now() + 60_000,
          swimPaleUntil: Date.now() + 600_000
        }
      } else if (hit === 'meow') {
        say(t('home.pet.bubble.meow'))
      } else if (hit === 'rainbow') {
        rainbowUntil = perf + 12_000
      }
    }
    persist()
  }

  function bindPet(node: HTMLElement | null): void {
    el.value = node
  }

  function bindShadow(node: HTMLElement | null): void {
    shadow.value = node
  }

  function mount(): void {
    eggs.value = loadEggs(Date.now(), storage)
    best.value = eggs.value.bestScore
    lastSave = Date.now()
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(onResize)
      const body = host.body()
      const box = host.box()
      if (body) ro.observe(body)
      if (box) ro.observe(box)
      observers.push(ro)
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibilityChange)
    const input = host.input()
    input?.addEventListener('input', onComposerInput)
    input?.addEventListener('keydown', onComposerKeyDown)
    if (document.visibilityState === 'visible') start()
  }

  function dispose(): void {
    disposed = true
    cancelPendingDouble()
    stop()
    window.clearTimeout(press?.timer)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('resize', onResize)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    const input = host.input()
    input?.removeEventListener('input', onComposerInput)
    input?.removeEventListener('keydown', onComposerKeyDown)
    for (const ro of observers) ro.disconnect()
  }

  onScopeDispose(dispose)

  return {
    el,
    shadow,
    pose,
    color,
    bubble,
    dragging,
    game,
    score,
    lives,
    best,
    bricks,
    paddleX,
    paddleTop,
    tints,
    eggs,
    bindPet,
    bindShadow,
    mount,
    onClick,
    onPointerDown,
    notifySend,
    prints,
    fishCount,
    tanPercent,
    heart,
    suspend,
    resume
  }
}
