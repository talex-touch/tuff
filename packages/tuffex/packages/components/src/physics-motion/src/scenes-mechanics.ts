// Adapted from Amicro. MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import {
  accent, box, defineScene, dot, foldEase, group, ink, line, multi, muted, paper,
  ring, soft, springEase, strong, svg, stroke, text, track, unfold,
} from './scene-model'

const third = 'ConceptTrios3'
const redesign = 'RedesignedPhysicsTrios'
const variations = 'WhimsicalVariations'
const experiments = 'YuiPhysicsExperiments'

export const mechanicalScenes = {
  'anim-tension-capsule': defineScene('anim-tension-capsule', 'KineticTensionCapsule', 'KineticTensionCapsule', 2800, 'The rubber capsule stretches horizontally, compresses vertically and recoils; its internal nodes separate with the tension.', [
    box('capsule', 54, 62, 52, 36, strong, 18), dot('node-left', 67, 75, 10, paper), dot('node-right', 83, 75, 10, soft),
  ], [multi('capsule', 2800, [{ offset: 0, transform: 'scale(1,1)', borderRadius: '18px / 18px' }, { offset: .3, transform: 'scale(2.2846,.5667)', borderRadius: '5.7778px / 18px' }, { offset: .55, transform: 'scale(.6577,1.3067)', borderRadius: '26px / 16.2857px' }, { offset: .75, transform: 'scale(1.1092,.9161)', borderRadius: '15.7857px / 18px' }, { offset: .88, transform: 'scale(1,1)', borderRadius: '18px / 18px' }, { offset: 1, transform: 'scale(1,1)', borderRadius: '18px / 18px' }], springEase),
    track('node-left', 2800, [0, .3, .55, .75, .88, 1], ['translateX(0) scale(1)', 'translateX(-27.2px) scale(1.1,.85)', 'translateX(2.6px) scale(.9,1.12)', 'translateX(-2.3px) scale(1.03,.97)', 'translateX(0) scale(1)', 'translateX(0) scale(1)'], 'transform', springEase),
    track('node-right', 2800, [0, .3, .55, .75, .88, 1], ['translateX(0) scale(1)', 'translateX(27.2px) scale(1.1,.85)', 'translateX(-2.6px) scale(.9,1.12)', 'translateX(2.3px) scale(1.03,.97)', 'translateX(0) scale(1)', 'translateX(0) scale(1)'], 'transform', springEase)]),

  'area6': defineScene('area6', 'Area6', 'Area6', 1400, 'An unadorned pill widens, undershoots its resting width and recoils through a second overshoot.', [box('bar', 55, 64, 50, 32, accent, 20)], [
    track('bar', 1400, [0, .14286, .39286, .625, .74107, .85714, 1], ['scale(1,1)', 'scale(1,1)', 'scale(2.2,.875)', 'scale(.68,1.125)', 'scale(1.2,.9375)', 'scale(1,1)', 'scale(1,1)']),
    track('bar', 1400, [0, .14286, .39286, .625, .74107, .85714, 1], ['16px / 16px', '16px / 16px', '6.3636px / 16px', '25px / 15.1111px', '12.5px / 16px', '16px / 16px', '16px / 16px'], 'borderRadius'),
  ]),

  'anim-droplet-squish': defineScene('anim-droplet-squish', 'DropletSquish', third, 2400, 'A liquid capsule alternates flattened and tall impact silhouettes with asymmetric rounded ends.', [dot('droplet', 56, 56, 48)], [multi('droplet', 2400, [
    { offset: 0, transform: 'scale(1,1)', borderRadius: '50%' }, { offset: .35, transform: 'scale(1.4,.6)', borderRadius: '40% 40% 50% 50%' },
    { offset: .6, transform: 'scale(.7,1.35)', borderRadius: '50% 50% 30% 30%' }, { offset: .8, transform: 'scale(1.1,.9)' }, { offset: 1, transform: 'scale(1,1)', borderRadius: '50%' },
  ])]),

  'anim-segmented-link': defineScene('anim-segmented-link', 'SegmentedLinkStretch', third, 2400, 'Three distinct pill joints move apart by 14px at each outer joint, then snap together.', [box('left', 42, 64, 20, 32, soft, 16), box('middle', 70, 64, 20, 32, accent, 16), box('right', 98, 64, 20, 32, strong, 16)], [
    unfold('left', 'translateX(-14px)', 'translateX(0)', 2400, springEase), unfold('right', 'translateX(14px)', 'translateX(0)', 2400, springEase),
  ]),

  'anim-blind-pull': defineScene('anim-blind-pull', 'BlindPull', variations, 2800, 'Five accordion slats separate vertically while the tension cord and pull knob descend.', [
    box('header', 25, 28, 110, 8, muted, 4),
    ...[1, 2, 3, 4, 5].map(i => box(`slat-${i}`, 30, 28, 100, 7, accent, 4, { transform: `translateY(${i * 17}px)` })),
    box('cord', 122, 32, 2, 95, muted, 0, { transformOrigin: 'center top' }), dot('knob', 118, 122, 10, soft),
  ], [
    ...[1, 2, 3, 4, 5].map(i => multi(`slat-${i}`, 2800, [{ offset: 0, transform: 'translateY(0) scaleY(.2)', opacity: .4 }, { offset: .45, transform: `translateY(${i * 17}px) scaleY(1)`, opacity: 1 }, { offset: .55, transform: `translateY(${i * 17 * .95}px) scaleY(1)`, opacity: 1 }, { offset: .8, transform: `translateY(${i * 17}px) scaleY(1)`, opacity: 1 }, { offset: 1, transform: 'translateY(0) scaleY(.2)', opacity: .4 }], foldEase, i * 40)),
    track('cord', 2800, [0, .45, .8, 1], ['scaleY(.21053)', 'scaleY(1)', 'scaleY(1)', 'scaleY(.21053)'], 'transform', foldEase),
    track('knob', 2800, [0, .45, .8, 1], ['translateY(-75px)', 'translateY(0)', 'translateY(0)', 'translateY(-75px)'], 'transform', foldEase),
  ]),

  'anim-rotating-louvers': defineScene('anim-rotating-louvers', 'RotatingLouvers', third, 3000, 'Four independent architectural slats turn through 75° in delayed sequence.', [
    ...[0, 1, 2, 3].map(i => box(`louver-${i}`, 35, 48 + i * 18, 90, 10, accent, 2, { transform: 'perspective(400px) rotateX(75deg)' })),
  ], [0, 1, 2, 3].map(i => unfold(`louver-${i}`, 'perspective(400px) rotateX(75deg)', 'perspective(400px) rotateX(0deg)', 3000, 'ease-in-out', i * 80))),

  'anim-iris-shutter': defineScene('anim-iris-shutter', 'GeometricIrisShutter', redesign, 3000, 'A square camera aperture rotates 60° while expanding around its circular centre.', [
    box('housing', 42.5, 42.5, 75, 75, 'transparent', 16, { boxShadow: `inset 0 0 0 2px ${line}`, overflow: 'hidden' }, [box('iris', 12.5, 12.5, 50, 50, strong, 12, { transform: 'rotate(60deg) scale(1)' }, [dot('aperture', 17, 17, 16, soft)])]),
  ], [unfold('iris', 'rotate(60deg) scale(1)', 'rotate(0deg) scale(.3)')]),

  'radial-aperture': defineScene('radial-aperture', 'RadialAperture', third, 3000, 'A rounded square diaphragm rotates 90° inside its circular aperture housing.', [
    dot('housing', 45, 45, 70, 'transparent', { boxShadow: `inset 0 0 0 2px ${line}` }), box('diaphragm', 57.5, 57.5, 45, 45, accent, 12, { transform: 'rotate(90deg) scale(1)' }),
  ], [unfold('diaphragm', 'rotate(90deg) scale(1)', 'rotate(0deg) scale(.4)')]),

  'anim-bubble-level': defineScene('anim-bubble-level', 'PendulumBubbleLevel', redesign, 3000, 'The fluid bubble crosses its centre target, overshoots in both directions, then damps.', [
    box('vial', 25, 66, 110, 28, paper, 16, { boxShadow: `inset 0 0 0 2px ${line}` }, [box('target', 54, 0, 2, 28, muted, 0), dot('bubble', 45, 4, 20, soft)]),
  ], [track('bubble', 3000, [0, .25, .5, .75, 1], ['translateX(0)', 'translateX(-24px)', 'translateX(24px)', 'translateX(-8px)', 'translateX(0)'])]),

  'anim-kinetic-metronome': defineScene('anim-kinetic-metronome', 'KineticTickingMetronome', redesign, 2000, 'A weighted metronome arm ticks ±35° around its bottom pivot.', [
    group('arm', 78.5, 44, 3, 52, [box('shaft', 0, 0, 3, 52, muted, 0), box('weight', -6.5, -4, 16, 16, accent, 4)], { transformOrigin: 'center bottom' }), box('base', 56, 102, 48, 8, muted, 4),
  ], [track('arm', 1000, [0, .5, 1], ['rotate(-35deg)', 'rotate(35deg)', 'rotate(-35deg)'])]),

  'newtons-cradle': defineScene('newtons-cradle', 'NewtonsCradle', third, 2400, 'The left and right end balls swing on alternate halves of the transfer cycle.', [
    ...[0, 1, 2].map(i => group(`ball-${i}`, 44 + i * 28, 50, 16, 52, [box(`string-${i}`, 7.25, 0, 1.5, 36, muted, 0), dot(`mass-${i}`, 0, 36, 16, [soft, accent, strong][i]!)], { transformOrigin: 'center top' })),
  ], [track('ball-0', 2400, [0, .25, .5, 1], ['rotate(0deg)', 'rotate(35deg)', 'rotate(0deg)', 'rotate(0deg)']), track('ball-2', 2400, [0, .5, .75, 1], ['rotate(0deg)', 'rotate(0deg)', 'rotate(-35deg)', 'rotate(0deg)'])]),

  'anim-orbital-gimbal': defineScene('anim-orbital-gimbal', 'NestedOrbitalGimbal', redesign, 3000, 'The outer square uses a four-second clockwise track and the inner circle a two-second reverse track; the source restarts both after three seconds.', [
    box('outer', 45, 45, 70, 70, 'transparent', 16, { boxShadow: `inset 0 0 0 2px ${strong}` }), dot('inner', 58, 58, 44, 'transparent', { boxShadow: `inset 0 0 0 2px ${soft}` }), dot('core', 74, 74, 12, ink),
  ], [track('outer', 4000, [0, 1], ['rotate(0deg)', 'rotate(360deg)'], 'transform', 'linear'), track('inner', 2000, [0, 1], ['rotate(0deg)', 'rotate(-360deg)'], 'transform', 'linear')]),

  'gyroscope-rings': defineScene('gyroscope-rings', 'GyroscopeRings', third, 3000, 'A ring rotates through a full X turn and half Y turn in perspective around a fixed core.', [
    dot('ring', 45, 45, 70, 'transparent', { boxShadow: `inset 0 0 0 3px ${accent}` }), dot('core', 72, 72, 16, soft),
  ], [track('ring', 3000, [0, 1], ['perspective(500px) rotateX(0deg) rotateY(0deg)', 'perspective(500px) rotateX(360deg) rotateY(180deg)'], 'transform', 'linear')]),

  'anim-slinky-coil': defineScene('anim-slinky-coil', 'SlinkyCoil', third, 2400, 'Five horizontal coils extend upward from their bottom anchor and compress together.', [
    group('coil', 56, 43, 48, 64, [0, 1, 2, 3, 4].map(i => box(`coil-${i}`, 0, i * 14, 48, 8, i < 2 ? soft : i === 2 ? accent : strong, 4)), { transformOrigin: 'center bottom' }),
  ], [track('coil', 2400, [0, .45, .7, 1], ['scaleY(.4)', 'scaleY(1.3)', 'scaleY(1.3)', 'scaleY(.4)'], 'transform', springEase)]),

  'anim-squash-sphere': defineScene('anim-squash-sphere', 'SquashStretchSphere', third, 2200, 'A falling rubber sphere squashes on impact, stretches on rebound and returns to its launch height.', [
    dot('sphere', 62, 80, 36, accent, { transformOrigin: 'center bottom' }), box('floor', 52, 124, 56, 4, muted, 2),
  ], [track('sphere', 2200, [0, .4, .55, .7, .85, 1], ['translateY(-50px) scale(.85,1.25)', 'translateY(0) scale(1.4,.6)', 'translateY(-15px) scale(.9,1.15)', 'translateY(0) scale(1.15,.85)', 'translateY(-50px) scale(1,1)', 'translateY(-50px) scale(1,1)'], 'transform', 'cubic-bezier(0.25,1,0.5,1)')]),

  'anim-gelatin-wobble': defineScene('anim-gelatin-wobble', 'GelatinWobble', variations, 2200, 'A square gelatin cube lands with six diminishing vertical and aspect-ratio oscillations.', [
    box('jelly', 56, 64, 48, 48, accent, 16, { transformOrigin: 'center bottom' }), box('plate', 44, 120, 72, 5, muted, 3),
  ], [multi('jelly', 2200, [{ offset: 0, transform: 'translateY(-70px) scale(.8,1.25)', opacity: 0 }, { offset: .3, transform: 'translateY(0) scale(1.4,.6)', opacity: 1 }, { offset: .45, transform: 'translateY(-16px) scale(.85,1.2)', opacity: 1 }, { offset: .6, transform: 'translateY(0) scale(1.15,.85)' }, { offset: .75, transform: 'translateY(-4px) scale(.95,1.05)' }, { offset: .88, transform: 'translateY(0) scale(1.02,.98)' }, { offset: .95, transform: 'translateY(0) scale(1,1)' }, { offset: 1, transform: 'translateY(0) scale(1,1)', opacity: 1 }], 'cubic-bezier(0.25,1,0.5,1)')]),

  'anim-domino-chain': defineScene('anim-domino-chain', 'DominoChain', variations, 3000, 'Five upright tiles tip 72° sequentially around their lower-right corners, then reset.', [
    ...[0, 1, 2, 3, 4].map(i => box(`domino-${i}`, 20 + i * 26, 76, 10, 36, i % 2 === 0 ? soft : ink, 3, { transformOrigin: 'right bottom' })), box('floor', 15, 112, 130, 3, muted, 2),
  ], [0, 1, 2, 3, 4].map(i => track(`domino-${i}`, 3000, [0, .15, .35, .8, .95, 1], ['rotate(0deg)', 'rotate(0deg)', 'rotate(72deg)', 'rotate(72deg)', 'rotate(0deg)', 'rotate(0deg)'], 'transform', 'cubic-bezier(0.6,-0.28,0.735,0.045)', i * 120))),

  'anim-card-cascade': defineScene('anim-card-cascade', 'CardDeckCascade', third, 3000, 'Three cards fan radially by ±22° and ±24px around a lower pivot.', [
    ...[-1, 0, 1].map((direction, i) => box(`card-${i}`, 59, 51, 42, 58, [strong, accent, soft][i]!, 12, { transformOrigin: 'center bottom', transform: `rotate(${direction * 22}deg) translateX(${direction * 24}px)`, boxShadow: ring })),
  ], [-1, 0, 1].map((direction, i) => unfold(`card-${i}`, `rotate(${direction * 22}deg) translateX(${direction * 24}px)`, 'rotate(0deg) translateX(0)', 3000, springEase))),

  'fan-fold': defineScene('fan-fold', 'FanFold', variations, 2800, 'Five slender origami fan blades spread to ±40° about a common rivet.', [
    ...[-40, -20, 0, 20, 40].map((angle, i) => box(`blade-${i}`, 73, 48, 14, 55, i % 2 === 0 ? soft : strong, '7px 7px 0 0', { transformOrigin: 'center bottom', transform: `rotate(${angle}deg)` })), dot('rivet', 74, 99, 12, accent),
  ], [-40, -20, 0, 20, 40].map((angle, i) => multi(`blade-${i}`, 2800, [{ offset: 0, transform: 'rotate(0deg)', opacity: .6 }, { offset: .4, transform: `rotate(${angle}deg)`, opacity: 1 }, { offset: .75, transform: `rotate(${angle}deg)`, opacity: 1 }, { offset: 1, transform: 'rotate(0deg)', opacity: .6 }], foldEase))),

  'anim-gear-step': defineScene('anim-gear-step', 'GearToothStep', third, 3000, 'Two overlapping toothed rings revolve in synchronized opposite four-second tracks, with the source three-second scene restart.', [svg(100, 70, '0 0 100 70', [
    stroke('circle', 'gear-left', { cx: 30, cy: 27, r: 18, 'stroke-dasharray': '6 5' }, soft, 8), stroke('circle', 'gear-right', { cx: 66, cy: 43, r: 18, 'stroke-dasharray': '6 5' }, strong, 8),
    { tag: 'circle', attrs: { cx: 30, cy: 27, r: 6, fill: soft } }, { tag: 'circle', attrs: { cx: 66, cy: 43, r: 6, fill: strong } },
  ])], [track('gear-left', 4000, [0, 1], ['rotate(0deg)', 'rotate(360deg)'], 'transform', 'linear'), track('gear-right', 4000, [0, 1], ['rotate(0deg)', 'rotate(-360deg)'], 'transform', 'linear')]),

  'anim-magnetic-disks': defineScene('anim-magnetic-disks', 'MagneticDisks', variations, 2400, 'Two disks stretch toward one another, squash at contact and separate after magnetic recoil.', [dot('left', 66, 66, 28, soft, { transform: 'translateX(-35px)' }), dot('right', 66, 66, 28, strong, { transform: 'translateX(35px)' })], [-1, 1].map((direction, i) => track(i === 0 ? 'left' : 'right', 2400, [0, .35, .5, .65, .8, 1], [`translateX(${direction * 35}px) scale(1,1)`, `translateX(${direction * 20}px) scale(1.2,.85)`, 'translateX(0) scale(.85,1.25)', 'translateX(0) scale(1,1)', `translateX(${direction * 35}px) scale(.9,1.1)`, `translateX(${direction * 35}px) scale(1,1)`], 'transform', springEase))),

  'anim-dual-magnet': defineScene('anim-dual-magnet', 'DualMagnetDipole', redesign, 2400, 'North and south blocks close their 28px gap to 4px as the dipole cluster swells.', [
    group('cluster', 38, 66, 84, 28, [box('north', 0, 0, 28, 28, soft, 12, { transform: 'translateX(12px)' }, [text('north-label', 0, 0, 28, 28, '$north')]), box('south', 56, 0, 28, 28, accent, 12, { transform: 'translateX(-12px)' }, [text('south-label', 0, 0, 28, 28, '$south')])], { transform: 'scale(1.1)' }),
  ], [track('cluster', 2400, [0, .4, .7, 1], ['scale(1)', 'scale(1.1)', 'scale(1.1)', 'scale(1)'], 'transform', springEase), track('north', 2400, [0, .4, .7, 1], ['translateX(0)', 'translateX(12px)', 'translateX(12px)', 'translateX(0)'], 'transform', springEase), track('south', 2400, [0, .4, .7, 1], ['translateX(0)', 'translateX(-12px)', 'translateX(-12px)', 'translateX(0)'], 'transform', springEase)]),

  'anim-compass-deflect': defineScene('anim-compass-deflect', 'CompassNeedleDeflect', redesign, 2600, 'A two-tone compass needle deflects 65°, overshoots −45° and damps to north.', [
    dot('housing', 45, 45, 70, 'transparent', { boxShadow: `inset 0 0 0 2px ${line}` }), group('needle', 77, 56, 6, 48, [box('north', 0, 0, 6, 22, accent, '3px 3px 0 0'), box('south', 0, 26, 6, 22, muted, '0 0 3px 3px')]),
  ], [track('needle', 2600, [0, .3, .6, .8, 1], ['rotate(0deg)', 'rotate(65deg)', 'rotate(-45deg)', 'rotate(15deg)', 'rotate(0deg)'])]),

  'balance-scale': defineScene('balance-scale', 'BalanceScale', variations, 3200, 'Left and right weights arrive at different times and drive a damped balance-beam tilt.', [
    group('beam', 25, 80, 110, 8, [box('beam-bar', 0, 0, 110, 8, muted, 4), box('left-weight', 0, -22, 22, 22, accent, 8), box('right-weight', 88, -22, 22, 22, soft, 8)]),
    box('fulcrum', 70, 89, 20, 18, muted, 0, { clipPath: 'polygon(50% 0,100% 100%,0 100%)' }), box('base', 55, 112, 50, 4, muted, 2),
  ], [track('beam', 3200, [0, .25, .5, .75, .85, 1], ['rotate(0deg)', 'rotate(-14deg)', 'rotate(14deg)', 'rotate(-6deg)', 'rotate(3deg)', 'rotate(0deg)'], 'transform', 'cubic-bezier(0.45,0.05,0.55,0.95)'),
    multi('left-weight', 3200, [{ offset: 0, transform: 'translateY(-40px)', opacity: 0 }, { offset: .2, transform: 'translateY(0)', opacity: 1 }, { offset: .75, transform: 'translateY(0)', opacity: 1 }, { offset: .9, transform: 'translateY(-40px)', opacity: 0 }, { offset: 1, transform: 'translateY(-40px)', opacity: 0 }], springEase),
    multi('right-weight', 3200, [{ offset: 0, transform: 'translateY(-40px)', opacity: 0 }, { offset: .25, transform: 'translateY(-40px)', opacity: 0 }, { offset: .45, transform: 'translateY(0)', opacity: 1 }, { offset: .75, transform: 'translateY(0)', opacity: 1 }, { offset: .9, transform: 'translateY(-40px)', opacity: 0 }, { offset: 1, transform: 'translateY(-40px)', opacity: 0 }], springEase)]),

  'anim-sudden-brake': defineScene('anim-sudden-brake', 'SuddenBrake', experiments, 2800, 'A vehicle decelerates from the right, then tips backward and settles around its left wheel.', [
    group('travel', 54, 58, 52, 48, [group('body', 0, 0, 52, 48, [box('car', 0, 0, 52, 34, strong, 12, {}, [box('window', 18, 9, 16, 16, paper, 4)]), dot('wheel-left', 4, 28, 14, muted, { boxShadow: ring }), dot('wheel-right', 34, 28, 14, muted, { boxShadow: ring })], { transformOrigin: 'left bottom' })]), box('track', 27, 112, 106, 2, muted, 1),
  ], [track('travel', 2800, [0, .26786, 1], ['translateX(180px)', 'translateX(0)', 'translateX(0)'], 'transform', 'cubic-bezier(0,0.7,0.6,1)'),
    track('body', 2800, [0, .23214, .3125, .40893, .47321, .55357, 1], ['rotate(0deg)', 'rotate(0deg)', 'rotate(-18deg)', 'rotate(4deg)', 'rotate(-2deg)', 'rotate(0deg)', 'rotate(0deg)'])]),

  'anim-rolling-tumble': defineScene('anim-rolling-tumble', 'RollingTumble', experiments, 2600, 'A cube progresses through discrete quarter turns with forward momentum on a 2200ms track, reset at the source 2600ms cadence.', [
    box('cube', 63, 62, 34, 34, accent, 12, {}, [dot('cube-mark', 12, 12, 10, paper)]), box('floor', 31, 107, 98, 2, muted, 1),
  ], [track('cube', 2200, [0, .3, .6, .85, 1], ['translateX(-40px) rotate(0deg)', 'translateX(-10px) rotate(90deg)', 'translateX(20px) rotate(180deg)', 'translateX(45px) rotate(270deg)', 'translateX(45px) rotate(270deg)'], 'transform', springEase)]),

  'anim-inertia-skid': defineScene('anim-inertia-skid', 'InertiaSkidStop', experiments, 2800, 'A sliding block overshoots its landing position while its skew reverses under friction.', [box('block', 55, 64, 50, 32, accent, 12, {}, [box('stripe', 9, 13, 32, 6, paper, 3)])], [
    track('block', 2800, [0, .5, .75, 1], ['translateX(-80px) skewX(20deg)', 'translateX(10px) skewX(-15deg)', 'translateX(-4px) skewX(5deg)', 'translateX(0) skewX(0deg)'], 'transform', 'cubic-bezier(0.25,1,0.5,1)'),
  ]),
}
