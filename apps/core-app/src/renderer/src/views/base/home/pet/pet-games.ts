export type PetGame = 'breakout' | 'juggling' | 'flight' | 'zerog'

export const GAME_FLIGHT_MS = 20_000
export const GAME_ZEROG_MS = 25_000
export const JUGGLE_IDLE_MS = 3_000
export const BALL_RADIUS = 16
export const PADDLE_HALF = 48
export const PADDLE_H = 10
const BALL_SPEED = 340
const BRICK_H = 22
const BRICK_GAP = 6
const BRICK_ROWS = 3

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface Brick extends Rect {
  alive: boolean
}

export interface BallState {
  x: number
  y: number
  vx: number
  vy: number
}

export interface BreakoutState {
  ball: BallState
  bricks: Brick[]
  lives: number
  score: number
  combo: number
  won: boolean
  over: boolean
}

export interface BreakoutTick {
  state: BreakoutState
  brokeBrick: boolean
  lost: boolean
}

export interface JuggleState {
  score: number
  idleMs: number
  over: boolean
}

export function chooseGame(dizzy: boolean, roll: number): PetGame {
  if (dizzy) return 'breakout'
  if (roll < 1 / 3) return 'juggling'
  return roll < 2 / 3 ? 'flight' : 'zerog'
}

/** Bricks fill a band of three rows; the band is at most 120px tall, sitting above the composer. */
export function buildBricks(area: Rect): Brick[] {
  const width = area.right - area.left
  const cols = Math.max(4, Math.min(10, Math.floor(width / 72)))
  const cell = (width - BRICK_GAP * (cols - 1)) / cols
  const bricks: Brick[] = []
  for (let row = 0; row < BRICK_ROWS; row++) {
    for (let col = 0; col < cols; col++) {
      const left = area.left + col * (cell + BRICK_GAP)
      const top = area.top + row * (BRICK_H + BRICK_GAP)
      bricks.push({ left, top, right: left + cell, bottom: top + BRICK_H, alive: true })
    }
  }
  return bricks
}

export function launchBall(paddleCx: number, paddleY: number): BallState {
  return { x: paddleCx, y: paddleY - 40, vx: 0.4 * BALL_SPEED, vy: -0.9 * BALL_SPEED }
}

export function createBreakout(area: Rect, paddleCx: number, paddleY: number): BreakoutState {
  return {
    ball: launchBall(paddleCx, paddleY),
    bricks: buildBricks(area),
    lives: 3,
    score: 0,
    combo: 0,
    won: false,
    over: false
  }
}

function hitsBrick(x: number, y: number, brick: Brick): boolean {
  const nx = Math.max(brick.left, Math.min(x, brick.right))
  const ny = Math.max(brick.top, Math.min(y, brick.bottom))
  return (x - nx) ** 2 + (y - ny) ** 2 < BALL_RADIUS ** 2
}

/** Advances the ball one step. The bounds are the playfield; the paddle moves along its own line. */
export function stepBreakout(
  s: BreakoutState,
  dt: number,
  bounds: Rect,
  paddleCx: number,
  paddleY: number
): BreakoutTick {
  let { x, y, vx, vy } = s.ball
  x += vx * dt
  y += vy * dt
  if (x - BALL_RADIUS < bounds.left) {
    x = bounds.left + BALL_RADIUS
    vx = Math.abs(vx)
  }
  if (x + BALL_RADIUS > bounds.right) {
    x = bounds.right - BALL_RADIUS
    vx = -Math.abs(vx)
  }
  if (y - BALL_RADIUS < bounds.top) {
    y = bounds.top + BALL_RADIUS
    vy = Math.abs(vy)
  }

  const bricks = s.bricks.map((brick) => ({ ...brick }))
  let score = s.score
  let combo = s.combo
  let brokeBrick = false
  for (const brick of bricks) {
    if (!brick.alive || !hitsBrick(x, y, brick)) continue
    brick.alive = false
    if (y < brick.top || y > brick.bottom) vy = -vy
    else vx = -vx
    combo += 1
    score += 10 * combo
    brokeBrick = true
    break
  }

  const onPaddle =
    vy > 0 &&
    y + BALL_RADIUS >= paddleY &&
    y + BALL_RADIUS <= paddleY + PADDLE_H + 12 &&
    Math.abs(x - paddleCx) <= PADDLE_HALF + BALL_RADIUS
  if (onPaddle) {
    const t = Math.max(-1, Math.min(1, (x - paddleCx) / PADDLE_HALF))
    vx = t * 0.8 * BALL_SPEED
    vy = -Math.sqrt(Math.max(BALL_SPEED ** 2 - vx ** 2, 0))
    y = paddleY - BALL_RADIUS
    combo = 0
  }

  let lives = s.lives
  let lost = false
  let ball: BallState = { x, y, vx, vy }
  if (y - BALL_RADIUS > paddleY + PADDLE_H + 20) {
    lives -= 1
    lost = true
    combo = 0
    ball = launchBall(paddleCx, paddleY)
  }
  const won = bricks.every((brick) => !brick.alive)
  return {
    state: { ball, bricks, lives, score, combo, won, over: lives <= 0 || won },
    brokeBrick,
    lost
  }
}

export function createJuggle(): JuggleState {
  return { score: 0, idleMs: 0, over: false }
}

export function bumpJuggle(s: JuggleState): JuggleState {
  return { ...s, score: s.score + 1, idleMs: 0 }
}

export function stepJuggle(s: JuggleState, dtMs: number): JuggleState {
  const idleMs = s.idleMs + dtMs
  return { ...s, idleMs, over: idleMs >= JUGGLE_IDLE_MS }
}
