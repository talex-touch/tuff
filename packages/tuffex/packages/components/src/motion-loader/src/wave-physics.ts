// Ported from registry/ui/loading/wave-physics-loader.tsx in Amicro.
// MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { LoaderNode } from './scene-types'

/** The upstream 15-bar / four-bounce / 201-frame trajectory, not a sine spinner. */
export function buildWavePhysicsScene(): LoaderNode {
  const numBars = 15
  const numFrames = 201
  const bars = Array.from({ length: numBars }, () => ({
    heights: [] as string[],
    colors: [] as string[],
  }))
  const ballX: string[] = []
  const ballY: string[] = []
  const ballScaleX: number[] = []
  const ballScaleY: number[] = []
  const times: number[] = []

  for (let k = 0; k < numFrames; k++) {
    const t = k / (numFrames - 1)
    times.push(t)
    const fraction = t < 0.5 ? t / 0.5 : (1 - t) / 0.5
    const ballIndex = fraction * (numBars - 1)
    ballX.push(`${ballIndex * 20}px`)
    let bounceFraction = (fraction * 4) % 1
    if (fraction === 1 || fraction === 0)
      bounceFraction = 0
    const bounceHeight = 4 * bounceFraction * (1 - bounceFraction)
    const heightFactor = Math.max(0, 1 - bounceHeight * 2)
    const indent = heightFactor * 20
    ballY.push(`-${16 + 48 - indent + bounceHeight * 60}px`)
    ballScaleY.push(1 - heightFactor * 0.3)
    ballScaleX.push(1 + heightFactor * 0.25)

    for (let i = 0; i < numBars; i++) {
      const distance = Math.abs(i - ballIndex)
      const wave = distance < 3 ? Math.cos((distance / 3) * (Math.PI / 2)) : 0
      const barIndent = distance < 1.5
        ? Math.cos((distance / 1.5) * (Math.PI / 2)) * heightFactor * 20
        : 0
      bars[i]!.heights.push(`${Math.max(4, 16 + wave * 48 - barIndent)}px`)
      // The source interpolates zinc-200 ↔ zinc-800 and reverses for dark mode.
      // Theme tokens retain the same wave-dependent contrast without frozen RGB.
      bars[i]!.colors.push(`color-mix(in srgb, var(--tx-text-color-primary) ${wave * 100}%, var(--tx-fill-color-dark))`)
    }
  }

  return {
    tag: 'div',
    zoom: 0.38,
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'flex-end',
      gap: '8px',
      width: '292px',
      height: '192px',
    },
    children: [
      ...bars.map(bar => ({
        tag: 'div',
        style: {
          width: '12px',
          height: '16px',
          borderRadius: '999px',
          transformOrigin: 'bottom',
          backgroundColor: 'var(--tx-fill-color-dark)',
        },
        motion: {
          values: { height: bar.heights, backgroundColor: bar.colors },
          timing: { duration: 4, times, ease: 'linear' },
        },
      })),
      {
        tag: 'div',
        style: {
          position: 'absolute',
          bottom: '0px',
          left: '0px',
          width: '12px',
          height: '12px',
          borderRadius: '999px',
          backgroundColor: 'var(--tx-text-color-primary)',
          transformOrigin: 'bottom center',
          boxShadow: 'var(--tx-elevation-1)',
        },
        motion: {
          values: { x: ballX, y: ballY, scaleX: ballScaleX, scaleY: ballScaleY },
          timing: { duration: 4, times, ease: 'linear' },
        },
      },
    ],
  }
}
