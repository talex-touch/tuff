// Adapted from Amicro. MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import {
  accent, box, defineScene, dot, group, multi, paper, ring, soft,
  springEase, strong, stroke, svg, track, unfold,
} from './scene-model'

const redesign = 'RedesignedPhysicsTrios'
const second = 'ConceptTrios2'
const third = 'ConceptTrios3'

export const graphicScenes = {
  'anim-circuit-trace': defineScene('anim-circuit-trace', 'CircuitTraceDraw', redesign, 3000, 'An angular PCB trace draws and erases between two fixed terminal nodes.', [
    svg(110, 65, '0 0 140 70', [stroke('polyline', 'trace', { points: '10,35 40,35 60,15 90,15 110,50 130,50', 'stroke-dasharray': 400 }, accent, 4), { tag: 'circle', attrs: { cx: 10, cy: 35, r: 4, fill: accent } }, { tag: 'circle', attrs: { cx: 130, cy: 50, r: 4, fill: accent } }]),
  ], [track('trace', 3000, [0, .5, .8, 1], ['400', '0', '-400', '-400'], 'strokeDashoffset')]),

  'anim-hex-lattice': defineScene('anim-hex-lattice', 'HexagonLatticeDraw', redesign, 3000, 'A six-sided wireframe assembles by stroke drawing and then wipes around its perimeter.', [
    svg(75, 75, '0 0 100 100', [stroke('polygon', 'hexagon', { points: '50,10 85,30 85,70 50,90 15,70 15,30', 'stroke-dasharray': 300 }, soft)]),
  ], [track('hexagon', 3000, [0, .5, .8, 1], ['300', '0', '-300', '-300'], 'strokeDashoffset')]),

  'anim-stroke-waveform': defineScene('anim-stroke-waveform', 'StrokeWaveform', second, 3000, 'The source cardiac waveform draws left to right and progressively erases.', [
    svg(130, 60, '0 0 160 80', [stroke('polyline', 'waveform', { points: '10,40 40,40 55,15 70,65 85,30 95,50 110,40 150,40', 'stroke-dasharray': 500 }, soft)]),
  ], [track('waveform', 3000, [0, .5, .8, 1], ['500', '0', '-500', '-500'], 'strokeDashoffset')]),

  'stroke-spiral': defineScene('stroke-spiral', 'StrokeSpiral', second, 3000, 'A circular signature draws while rotating through 180°, then clears during the second half turn.', [
    svg(80, 80, '0 0 100 100', [stroke('circle', 'spiral', { cx: 50, cy: 50, r: 36, 'stroke-dasharray': 600 }, accent, 6)]),
  ], [multi('spiral', 3000, [{ offset: 0, strokeDashoffset: 600, transform: 'rotate(0deg)' }, { offset: .6, strokeDashoffset: 0, transform: 'rotate(180deg)' }, { offset: .8, strokeDashoffset: -600, transform: 'rotate(360deg)' }, { offset: 1, strokeDashoffset: -600, transform: 'rotate(360deg)' }])]),

  'kakikaki': defineScene('kakikaki', 'Kakikaki', 'Kakikaki', 3000, 'The original seven-point calligraphic zigzag draws across its full stroke and then clears.', [
    svg(150, 100, '0 0 200 120', [stroke('polyline', 'signature', { points: '20,100 40,20 80,100 100,40 140,90 170,30 190,70', 'stroke-dasharray': 1200 }, accent, 6)]),
  ], [track('signature', 3000, [0, .6, .8, 1], ['1200', '0', '-1200', '-1200'], 'strokeDashoffset')]),

  'anim-neon-sign': defineScene('anim-neon-sign', 'NeonSignDraw', 'YuiPhysicsExperiments', 2800, 'A distinct neon pulse polyline draws in 240ms, holds, then clears over the final 1200ms.', [
    svg(130, 65, '0 0 160 80', [stroke('polyline', 'neon', { points: '15,40 50,40 70,18 90,62 110,40 145,40', 'stroke-dasharray': '240 240' }, accent)]),
  ], [multi('neon', 2800, [{ offset: 0, strokeDasharray: '0 240', strokeDashoffset: 0, opacity: 0 }, { offset: .085714, strokeDasharray: '240 240', strokeDashoffset: 0, opacity: 1 }, { offset: .778571, strokeDasharray: '240 240', strokeDashoffset: 0, opacity: 1 }, { offset: .928571, strokeDasharray: '240 240', strokeDashoffset: -240, opacity: 0 }, { offset: 1, strokeDasharray: '240 240', strokeDashoffset: -240, opacity: 0 }])]),

  'anim-prism-stack': defineScene('anim-prism-stack', 'PrismBlockStack', redesign, 3000, 'Three descending prisms stack from wide foundation to narrow top with delayed weighted landings.', [
    box('prism-0', 44, 98, 72, 16, strong, 6), box('prism-1', 52, 76, 56, 16, accent, 6), box('prism-2', 60, 54, 40, 16, soft, 6),
  ], [0, 1, 2].map(i => multi(`prism-${i}`, 3000, [{ offset: 0, transform: 'translateY(-60px) rotate(15deg)', opacity: 0 }, { offset: .3, transform: 'translateY(0) rotate(0deg)', opacity: 1 }, { offset: .75, transform: 'translateY(0) rotate(0deg)', opacity: 1 }, { offset: 1, transform: 'translateY(60px) rotate(0deg)', opacity: 0 }], springEase, i * 200))),

  'anim-modular-tile': defineScene('anim-modular-tile', 'ModularTileSnap', redesign, 3000, 'Two rotating modules snap into place, one with a circular inset and one with a square inset.', [
    box('tile-0', 41, 62, 36, 36, accent, 12, {}, [dot('circle-inset', 12, 12, 12, paper)]), box('tile-1', 83, 62, 36, 36, strong, 12, {}, [box('square-inset', 12, 12, 12, 12, paper, 4)]),
  ], [0, 1].map(i => multi(`tile-${i}`, 3000, [{ offset: 0, transform: 'scale(.6) rotate(15deg)', opacity: 0 }, { offset: .35, transform: 'scale(1) rotate(0deg)', opacity: 1 }, { offset: .75, transform: 'scale(1) rotate(0deg)', opacity: 1 }, { offset: 1, transform: 'scale(.6) rotate(15deg)', opacity: 0 }], springEase, i * 150))),

  'anim-pyramid-build': defineScene('anim-pyramid-build', 'PyramidBlockBuild', second, 3000, 'A three-two-one pyramid builds base to peak through staggered row-scale pops.', [
    group('base', 46, 94, 68, 20, [0, 1, 2].map(i => box(`base-${i}`, i * 24, 0, 20, 20, strong, 6))), group('middle', 58, 70, 44, 20, [0, 1].map(i => box(`middle-${i}`, i * 24, 0, 20, 20, accent, 6))), box('peak', 70, 46, 20, 20, soft, 6),
  ], ['base', 'middle', 'peak'].map((part, i) => multi(part, 3000, [{ offset: 0, transform: 'scale(0)', opacity: 0 }, { offset: .15, transform: 'scale(0)', opacity: 0 }, { offset: .3, transform: 'scale(1)', opacity: 1 }, { offset: .75, transform: 'scale(1)', opacity: 1 }, { offset: .9, transform: 'scale(0)', opacity: 0 }, { offset: 1, transform: 'scale(0)', opacity: 0 }], springEase, i * 200))),

  'tetris-block-settle': defineScene('tetris-block-settle', 'TetrisBlockSettle', second, 3000, 'An actual L-shaped three-square block settles above a fixed three-block foundation.', [
    ...[0, 1, 2].map(i => box(`foundation-${i}`, 43 + i * 26, 108, 22, 22, strong, 6)),
    group('L-piece', 56, 64, 48, 44, [box('upper', 0, 0, 22, 22, accent, 6), box('lower-left', 0, 22, 22, 22, accent, 6), box('lower-right', 26, 22, 22, 22, accent, 6)]),
  ], [multi('L-piece', 3000, [{ offset: 0, transform: 'translateY(-70px) rotate(-15deg)', opacity: 0 }, { offset: .3, transform: 'translateY(0) rotate(4deg)', opacity: 1 }, { offset: .45, transform: 'translateY(-6px) rotate(-2deg)', opacity: 1 }, { offset: .6, transform: 'translateY(0) rotate(0deg)', opacity: 1 }, { offset: .8, transform: 'translateY(0) rotate(0deg)', opacity: 1 }, { offset: 1, transform: 'translateY(80px) rotate(0deg)', opacity: 0 }], springEase)]),

  'anim-shutter-blocks': defineScene('anim-shutter-blocks', 'ShutterStepBlocks', 'YuiPhysicsExperiments', 2800, 'Four horizontal slices open left to right with an 80ms per-tier phase delay.', [
    ...[0, 1, 2, 3].map(i => box(`slice-${i}`, 30, 50 + i * 15, 100, 11, i % 2 === 0 ? strong : soft, 6, { transformOrigin: 'left center' })),
  ], [0, 1, 2, 3].map(i => unfold(`slice-${i}`, 'scaleX(1)', 'scaleX(0)', 2800, 'cubic-bezier(0.65,0,0.35,1)', i * 80))),

  'magnetic-orbit-particle': defineScene('magnetic-orbit-particle', 'MagneticOrbitParticle', third, 3000, 'A satellite follows its 2600ms circular orbit around a fixed core, with the source 3000ms scene restart.', [
    group('orbit', 45, 45, 70, 70, [dot('satellite', 28, 0, 14, soft)]), dot('core', 66, 66, 28, strong),
  ], [track('orbit', 2600, [0, 1], ['rotate(0deg)', 'rotate(360deg)'], 'transform', 'linear')]),

  'magnetic-grid-repel': defineScene('magnetic-grid-repel', 'MagneticGridRepel', third, 2600, 'Four magnetic grid points disperse along independent diagonal vectors and return.', [
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, y], i) => dot(`point-${i}`, 72 + x! * 15, 72 + y! * 15, 16, i < 2 ? soft : strong, { transform: `translate(${x! * 10}px,${y! * 10}px)` })),
  ], [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, y], i) => unfold(`point-${i}`, `translate(${x! * 10}px,${y! * 10}px)`, 'translate(0,0)', 2600, springEase))),

  'tsumiki': defineScene('tsumiki', 'Tsumiki', 'Tsumiki', 3000, 'Five bars drop from alternating rotations, cover the stack at 1400ms, then cascade downward in reverse order.', [
    ...[0, 1, 2, 3, 4].map(i => box(`bar-${i}`, 45, 28 + i * 22, 70, 18, i < 2 ? soft : i === 2 ? accent : strong, 14)),
  ], [0, 1, 2, 3, 4].map((i) => {
    const start = (4 - i) * 150
    const leave = 2000 - i * 150
    const sign = i % 2 === 0 ? 1 : -1
    return multi(`bar-${i}`, 3000, [
      { offset: 0, transform: `translateY(-300%) rotate(${sign * 30}deg)`, opacity: 0 },
      ...(start > 0 ? [{ offset: start / 3000, transform: `translateY(-300%) rotate(${sign * 30}deg)`, opacity: 0 }] : []),
      { offset: (start + 160) / 3000, opacity: 1 },
      { offset: (start + 480) / 3000, transform: `translateY(0) rotate(${sign * -4}deg)`, opacity: 1 },
      { offset: (start + 560) / 3000, transform: `translateY(-10%) rotate(${sign * 2}deg)`, opacity: 1 },
      { offset: (start + 640) / 3000, transform: 'translateY(0) rotate(0deg)', opacity: 1 },
      { offset: (start + 720) / 3000, transform: `translateY(-5%) rotate(${-sign}deg)`, opacity: 1 },
      { offset: (start + 800) / 3000, transform: 'translateY(0) rotate(0deg)', opacity: 1 },
      { offset: leave / 3000, transform: 'translateY(0) rotate(0deg)', opacity: 1, easing: 'cubic-bezier(0.74,0.03,1,1)' },
      { offset: (leave + 400) / 3000, opacity: 1, easing: 'cubic-bezier(0.74,0.03,1,1)' },
      { offset: (leave + 500) / 3000, transform: `translateY(400%) rotate(${sign * 20}deg)`, opacity: 0 },
      { offset: 1, transform: `translateY(400%) rotate(${sign * 20}deg)`, opacity: 0 },
    ])
  }), 1400),

  'bookmark': defineScene('bookmark', 'Bookmark', 'Bookmark', 3600, 'Layered notched ribbons lift and descend in perspective while circular washes and four signature sparkles appear in sequence.', [
    group('bookmark-box', 35, 35, 90, 90, [dot('wash', 0, 0, 90, soft), dot('wash-alt', 0, 0, 90, paper),
      group('marks', 12, 0, 66, 66, [box('mark-first', 11.55, 0, 42.9, 66, strong, 0, { clipPath: 'polygon(0 0,100% 0,100% 100%,50% 80%,0 100%)' }),
        group('marks-main', 0, 0, 66, 66, [0, 1, 2].map(i => box(`mark-${i}`, 11.55, 0, 42.9, 66, [soft, accent, strong][i]!, 0, { clipPath: 'polygon(0 0,100% 0,100% 100%,50% 80%,0 100%)', transformOrigin: 'center top' }))),
      ]),
      ...[[2, 15], [62, 43], [9, 56], [58, 5]].map(([x, y], i) => ({ tag: 'svg', part: `spark-${i}`, attrs: { viewBox: '0 0 32 32', fill: soft }, style: { position: 'absolute' as const, left: `${x}px`, top: `${y}px`, width: '26px', height: '26px' }, children: [{ tag: 'path', attrs: { d: 'M16 0C17.2 11.5 20.5 14.8 32 16C20.5 17.2 17.2 20.5 16 32C14.8 20.5 11.5 17.2 0 16C11.5 14.8 14.8 11.5 16 0Z' } }] })),
    ], { background: paper, borderRadius: '20px', boxShadow: ring, overflow: 'hidden' }),
  ], [
    track('wash', 3600, [0, .11111, .33333, 1], ['scale(0)', 'scale(0)', 'scale(1.3)', 'scale(1.3)'], 'transform', 'cubic-bezier(0.7,0.01,0.23,1)'),
    track('wash-alt', 3600, [0, .72222, .94444, 1], ['scale(0)', 'scale(0)', 'scale(1.3)', 'scale(1.3)'], 'transform', 'cubic-bezier(0.7,0.01,0.23,1)'),
    track('mark-first', 3600, [0, .07639, .15278, .27778, .28056, 1], ['translateY(0)', 'translateY(22%)', 'translateY(-101%)', 'translateY(-101%)', 'translateY(0)', 'translateY(0)'], 'transform', 'cubic-bezier(0.75,0.01,0.24,0.98)'),
    track('mark-first', 3600, [0, .72222, 1], [strong, strong, accent], 'backgroundColor', 'linear'),
    ...[0, 1, 2].map(i => track(`mark-${i}`, 3600, [0, (350 + i * 150) / 3600, (1050 + i * 150) / 3600, 1], [`perspective(700px) translateY(-40%) rotateX(80deg) rotateY(${[20, 12, 0][i]}deg) scale(1.5,1.15)`, `perspective(700px) translateY(-40%) rotateX(80deg) rotateY(${[20, 12, 0][i]}deg) scale(1.5,1.15)`, 'perspective(700px) translateY(0) rotateX(0deg) rotateY(0deg) scale(1)', 'perspective(700px) translateY(0) rotateX(0deg) rotateY(0deg) scale(1)'], 'transform', 'cubic-bezier(0.7,0.01,0.23,1)')),
    track('marks-main', 3600, [0, .72222, .79861, .875, 1], ['translateY(0)', 'translateY(0)', 'translateY(22%)', 'translateY(-101%)', 'translateY(-101%)'], 'transform', 'cubic-bezier(0.75,0.01,0.24,0.98)'),
    ...[0, 1, 2, 3].map(i => track(`spark-${i}`, 3600, [0, (800 + i * 200) / 3600, (1100 + i * 200) / 3600, (1400 + i * 200) / 3600, 1], ['scale(0)', 'scale(0)', 'scale(1)', 'scale(0)', 'scale(0)'])),
  ]),
}
