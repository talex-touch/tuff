// Adapted from Amicro. MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import {
  accent, box, defineScene, dot, foldEase, group, multi, muted, paper, ring,
  soft, springEase, strong, text, track, unfold,
} from './scene-model'

const redesign = 'RedesignedPhysicsTrios'
const first = 'ConceptTrios1'
const second = 'ConceptTrios2'

export const paperScenes = {
  'anim-card-peel': defineScene('anim-card-peel', 'CardStackPeel', redesign, 3000, 'A top card peels down 24px with a 25° perspective tilt, revealing the underlay.', [
    box('underlay', 30, 48, 100, 65, paper, 16, { boxShadow: ring }, [box('under-bar', 12, 12, 40, 6)]),
    box('sheet', 30, 48, 100, 65, strong, 16, { transformOrigin: 'center top', transform: 'perspective(400px) translateY(24px) rotateX(25deg)', opacity: .9 }, [box('bar', 26, 29, 48, 8, paper, 4)]),
  ], [multi('sheet', 3000, [{ offset: 0, transform: 'perspective(400px) translateY(0) rotateX(0deg)', opacity: 1 }, { offset: .4, transform: 'perspective(400px) translateY(24px) rotateX(25deg)', opacity: .9 }, { offset: .75, transform: 'perspective(400px) translateY(24px) rotateX(25deg)', opacity: .9 }, { offset: 1, transform: 'perspective(400px) translateY(0) rotateX(0deg)', opacity: 1 }], springEase)]),

  'anim-bookmark-corner': defineScene('anim-bookmark-corner', 'BookmarkCornerPeel', first, 3000, 'The upper-right dog-ear clips away and its folded corner slides into view.', [
    box('card', 25, 43, 110, 75, paper, 16, { boxShadow: ring, clipPath: 'polygon(0 0,65% 0,100% 35%,100% 100%,0 100%)' }, [box('bar1', 12, 16, 48, 8), box('bar2', 12, 32, 32, 8, soft)]),
    group('corner-window', 97, 43, 38, 38, [box('corner', 0, 0, 38, 38, strong, '0 0 0 12px')], { overflow: 'hidden' }),
  ], [
    track('card', 3000, [0, .4, .75, 1], ['polygon(0 0,100% 0,100% 100%,0 100%)', 'polygon(0 0,65% 0,100% 35%,100% 100%,0 100%)', 'polygon(0 0,65% 0,100% 35%,100% 100%,0 100%)', 'polygon(0 0,100% 0,100% 100%,0 100%)'], 'clipPath', foldEase),
    multi('corner', 3000, [{ offset: 0, transform: 'translate(100%,-100%)', opacity: 0 }, { offset: .4, transform: 'translate(0,0)', opacity: 1 }, { offset: .75, transform: 'translate(0,0)', opacity: 1 }, { offset: 1, transform: 'translate(100%,-100%)', opacity: 0 }], foldEase),
  ]),

  'anim-elastic-tag': defineScene('anim-elastic-tag', 'ElasticTagSnap', redesign, 3000, 'A luggage tag stretches down, then recoils above its anchor and settles.', [
    group('tag', 56, 38, 48, 68, [box('cord', 22, 0, 3, 28, muted, 2), box('badge', 0, 24, 48, 40, strong, 12, {}, [dot('hole', 14, 10, 20, 'transparent', { boxShadow: `inset 0 0 0 2px ${paper}` })])], { transformOrigin: 'center top' }),
  ], [track('tag', 3000, [0, .3, .5, .7, .85, 1], ['translateY(0) scaleY(1)', 'translateY(28px) scaleY(1.2)', 'translateY(-8px) scaleY(.9)', 'translateY(4px) scaleY(1.05)', 'translateY(0) scaleY(1)', 'translateY(0) scaleY(1)'], 'transform', springEase)]),

  'bookmark-stamp-drop': defineScene('bookmark-stamp-drop', 'BookmarkStampDrop', first, 3000, 'A hanging ribbon badge drops from above and damps its alternating angular swing.', [
    group('ribbon', 59, 38, 42, 84, [box('string', 19, 0, 3, 36), box('stamp', 0, 32, 42, 48, strong, 12, {}, [dot('stamp-hole', 13, 16, 16, paper)])], { transformOrigin: 'center top' }),
  ], [multi('ribbon', 3000, [
    { offset: 0, transform: 'translateY(-70px) rotate(15deg)', opacity: 0 },
    { offset: .3, transform: 'translateY(0) rotate(-6deg)', opacity: 1 },
    { offset: .45, transform: 'translateY(-8px) rotate(4deg)', opacity: 1 },
    { offset: .6, transform: 'translateY(0) rotate(-2deg)', opacity: 1 },
    { offset: .75, transform: 'translateY(0) rotate(0deg)', opacity: 1 },
    { offset: .9, transform: 'translateY(-70px) rotate(15deg)', opacity: 0 },
    { offset: 1, transform: 'translateY(-70px) rotate(15deg)', opacity: 0 },
  ], springEase)]),

  'anim-split-gate': defineScene('anim-split-gate', 'SplitGateReveal', redesign, 3000, 'Two vertically opposed gate panels uncover caller-provided content.', [
    group('gate', 25, 43, 110, 75, [
      box('background', 0, 0, 110, 75, soft, 16), text('content', 0, 0, 110, 75, '$content'),
      box('top', 0, 0, 110, 37.5, paper, 0, { transform: 'translateY(-75%)', boxShadow: ring }),
      box('bottom', 0, 37.5, 110, 37.5, paper, 0, { transform: 'translateY(75%)', boxShadow: ring }),
    ], { overflow: 'hidden', borderRadius: '16px', boxShadow: ring }),
  ], [unfold('top', 'translateY(-75%)'), unfold('bottom', 'translateY(75%)')]),

  'anim-shutter-slide': defineScene('anim-shutter-slide', 'ShutterSlide', first, 3000, 'Left and right half-width shutters slide horizontally by 95% of their own width.', [
    group('shutter', 20, 43, 120, 75, [box('base', 0, 0, 120, 75, soft, 16), text('content', 0, 0, 120, 75, '$content'),
      box('left', 0, 0, 60, 75, paper, 0, { transform: 'translateX(-95%)', boxShadow: ring }),
      box('right', 60, 0, 60, 75, paper, 0, { transform: 'translateX(95%)', boxShadow: ring }),
    ], { overflow: 'hidden', borderRadius: '16px', boxShadow: ring }),
  ], [unfold('left', 'translateX(-95%)'), unfold('right', 'translateX(95%)')]),

  'diagonal-drape': defineScene('diagonal-drape', 'DiagonalDrape', first, 3000, 'A diagonally clipped cloth exposes the accent field under a fixed pull pin.', [
    box('base', 20, 40, 120, 80, accent, 16),
    box('cloth', 20, 40, 120, 80, paper, 16, { clipPath: 'polygon(0 0,20% 0,100% 80%,100% 100%,0 100%)' }), dot('pin', 120, 48, 12, soft),
  ], [track('cloth', 3000, [0, .4, .75, 1], ['polygon(0 0,100% 0,100% 100%,0 100%)', 'polygon(0 0,20% 0,100% 80%,100% 100%,0 100%)', 'polygon(0 0,20% 0,100% 80%,100% 100%,0 100%)', 'polygon(0 0,100% 0,100% 100%,0 100%)'], 'clipPath', foldEase)]),

  'anim-origami-envelope': defineScene('anim-origami-envelope', 'OrigamiEnvelopeUnfold', redesign, 3000, 'The triangular envelope flap turns through 180° around its top hinge.', [
    box('envelope', 30, 48, 100, 65, strong, 12, { boxShadow: ring }, [box('message', 10, 10, 80, 45, soft, 8, {}, [box('message-line', 24, 19, 32, 6, paper, 3)]),
      box('flap', 0, 0, 100, 65, accent, 0, { clipPath: 'polygon(0 0,50% 50%,100% 0)', transformOrigin: 'center top', transform: 'perspective(400px) rotateX(180deg)' }),
    ]),
  ], [unfold('flap', 'perspective(400px) rotateX(180deg)', 'perspective(400px) rotateX(0deg)')]),

  'anim-card-dispenser': defineScene('anim-card-dispenser', 'SmartCardDispenser', redesign, 3000, 'An identity card ejects 38px upward from behind the dispenser slot.', [
    box('pass', 45, 68, 70, 45, accent, 12, { transform: 'translateY(-38px)' }, [dot('pass-dot', 12, 16, 12, paper), box('pass-line', 29, 20, 28, 6, soft, 3)]),
    box('dispenser', 33, 96, 95, 34, paper, 12, { boxShadow: ring }, [box('slot', 10, 15, 75, 3, muted, 2)]),
  ], [unfold('pass', 'translateY(-38px)', 'translateY(0)', 3000, springEase)]),

  'anim-sticky-note': defineScene('anim-sticky-note', 'StickyNotePeel', first, 3000, 'The top memo peels up from its bound edge, lifting and disappearing at 90°.', [
    box('pad', 43, 43, 75, 75, strong, 12),
    box('memo', 43, 43, 75, 75, soft, 12, { transformOrigin: 'center top' }, [box('memo-line', 15, 25, 45, 5, paper, 3), box('memo-line2', 15, 38, 30, 5, paper, 3)]),
  ], [multi('memo', 3000, [
    { offset: 0, transform: 'perspective(500px) rotateX(0deg) translateY(0)', opacity: 1 },
    { offset: .35, transform: 'perspective(500px) rotateX(65deg) translateY(-12px)', opacity: 1 },
    { offset: .5, transform: 'perspective(500px) rotateX(90deg) translateY(-40px)', opacity: 0 },
    { offset: 1, transform: 'perspective(500px) rotateX(90deg) translateY(-40px)', opacity: 0 },
  ], 'cubic-bezier(0.4,0,0.2,1)')]),

  'anim-receipt-tape': defineScene('anim-receipt-tape', 'ReceiptTapePrint', first, 3000, 'A receipt feeds downward in four discrete print steps, then retracts.', [
    box('receipt', 50, 57, 60, 55, accent, '0 0 8px 8px', { transformOrigin: 'center top' }, [box('line1', 5, 8, 50, 4, soft, 2), box('line2', 5, 18, 38, 4, soft, 2), box('line3', 5, 28, 25, 4, soft, 2)]),
    box('printer', 35, 45, 90, 18, paper, 20, { boxShadow: ring }, [box('slot', 12, 8, 65, 3, muted, 2)]),
  ], [multi('receipt', 3000, [{ offset: 0, clipPath: 'inset(0 0 55px round 0 0 8px 8px)', opacity: 0 }, { offset: .25, clipPath: 'inset(0 0 30px round 0 0 8px 8px)', opacity: 1 }, { offset: .5, clipPath: 'inset(0 0 0 round 0 0 8px 8px)', opacity: 1 }, { offset: .75, clipPath: 'inset(0 0 0 round 0 0 8px 8px)', opacity: 1 }, { offset: .9, clipPath: 'inset(0 0 55px round 0 0 8px 8px)', opacity: 0 }, { offset: 1, clipPath: 'inset(0 0 55px round 0 0 8px 8px)', opacity: 0 }], 'steps(4)')]),

  'anim-roller-blind': defineScene('anim-roller-blind', 'RollerBlindDrop', redesign, 3000, 'A single roller shade grows down from its fixed header, then rolls back up.', [
    box('shade', 36, 56, 88, 55, strong, '0 0 12px 12px', { transformOrigin: 'center top' }, [box('hem', 24, 47, 40, 4, soft, 2)]), box('roller', 30, 48, 100, 10, muted, 5),
  ], [track('shade', 3000, [0, .4, .75, 1], ['inset(0 0 47px round 0 0 12px 12px)', 'inset(0 0 0 round 0 0 12px 12px)', 'inset(0 0 0 round 0 0 12px 12px)', 'inset(0 0 47px round 0 0 12px 12px)'], 'clipPath', foldEase), unfold('hem', 'translateY(0)', 'translateY(-47px)')]),

  'anim-scroll-canvas': defineScene('anim-scroll-canvas', 'ScrollCanvasUnroll', second, 3000, 'The scroll opens symmetrically while its left and right rollers move apart.', [
    box('canvas', 32.5, 54, 95, 52, strong, 0, {}, [box('message-bar', 31.5, 22, 32, 8, soft, 4)]),
    box('left-roller', 22.5, 47.5, 10, 65, muted, 5), box('right-roller', 127.5, 47.5, 10, 65, muted, 5),
  ], [track('canvas', 3000, [0, .4, .75, 1], ['inset(0 40.5px)', 'inset(0 0px)', 'inset(0 0px)', 'inset(0 40.5px)'], 'clipPath', foldEase), unfold('left-roller', 'translateX(0)', 'translateX(40.5px)'), unfold('right-roller', 'translateX(0)', 'translateX(-40.5px)')]),

  'flag-pennant-unfurl': defineScene('flag-pennant-unfurl', 'FlagPennantUnfurl', second, 3000, 'A triangular pennant unfurls horizontally from its stationary pole.', [
    box('pole', 33, 48, 4, 65, muted, 2), box('flag', 35, 56, 70, 45, accent, 0, { clipPath: 'polygon(0 0,100% 50%,0 100%)', transformOrigin: 'left center' }),
  ], [unfold('flag', 'scaleX(1)', 'scaleX(0)', 3000, springEase)]),

  'anim-ribbon-banner': defineScene('anim-ribbon-banner', 'RibbonBannerSlide', redesign, 3000, 'A pill-shaped banner stretches outward from its centre, retaining two internal marks.', [
    box('banner', 32.5, 62, 95, 36, accent, 12, {}, [dot('mark', 12, 14, 8, paper), box('banner-line', 43, 15, 40, 6, paper, 3)]),
  ], [track('banner', 3000, [0, .4, .75, 1], ['inset(0 41.5px round 12px)', 'inset(0 0px round 12px)', 'inset(0 0px round 12px)', 'inset(0 41.5px round 12px)'], 'clipPath', springEase)]),

  'anim-page-turn': defineScene('anim-page-turn', 'PageTurnCurl', 'YuiPhysicsExperiments', 3000, 'A sheet rises 60px, uncurls its lower corners and flattens its 45° tilt.', [
    box('base-page', 40, 50, 80, 60, paper, 16, { boxShadow: ring }, [box('under-line', 12, 43, 32, 6, muted, 3)]),
    box('page', 40, 50, 80, 60, strong, 16, { transformOrigin: 'center bottom' }, [box('page-line', 20, 22, 40, 8, paper, 4), box('page-line2', 28, 36, 24, 6, soft, 3)]),
  ], [multi('page', 3000, [
    { offset: 0, transform: 'perspective(400px) translateY(60px) rotateX(45deg)', opacity: 0, borderRadius: '4px 4px 28px 28px' },
    { offset: .4, transform: 'perspective(400px) translateY(0) rotateX(0deg)', opacity: 1, borderRadius: '16px' },
    { offset: .75, transform: 'perspective(400px) translateY(0) rotateX(0deg)', opacity: 1, borderRadius: '16px' },
    { offset: 1, transform: 'perspective(400px) translateY(60px) rotateX(45deg)', opacity: 0, borderRadius: '4px 4px 28px 28px' },
  ], 'cubic-bezier(0.78,0,0.2,1)')]),

  'area1': defineScene('area1', 'Area1', 'Area1', 2200, 'A suspended fabric panel overshoots its open and closed heights between two rollers.', [
    group('hanger', 30, 28, 100, 30, [box('left-hanger', 0, 18, 50, 4, muted, 2, { transform: 'rotate(-30deg)', transformOrigin: 'right center' }), box('right-hanger', 50, 18, 50, 4, muted, 2, { transform: 'rotate(30deg)', transformOrigin: 'left center' }), dot('hook', 43, 9, 14)]),
    box('top-roller', 32.5, 54, 95, 9, muted, 5), box('cloth', 37.5, 63, 85, 70, strong, 0, { transformOrigin: 'center top' }), box('bottom-roller', 32.5, 133, 95, 9, muted, 5),
  ], [
    track('cloth', 2200, [0, .0909, .2545, .3636, .6364, .8, .9091, 1], ['scaleY(.14286)', 'scaleY(.14286)', 'scaleY(1.07143)', 'scaleY(1)', 'scaleY(1)', 'scaleY(.1)', 'scaleY(.14286)', 'scaleY(.14286)']),
    track('bottom-roller', 2200, [0, .0909, .2545, .3636, .6364, .8, .9091, 1], ['translateY(-60px)', 'translateY(-60px)', 'translateY(5px)', 'translateY(0)', 'translateY(0)', 'translateY(-63px)', 'translateY(-60px)', 'translateY(-60px)']),
  ]),

  'tissue': defineScene('tissue', 'Tissue', 'Tissue', 3000, 'One tissue is pulled out; the following tissue pushes up from the box slot.', [
    box('paper-out', 31, 51, 98, 30, soft, 0, { clipPath: 'polygon(0 0,100% 0,98% 100%,2% 100%)', transformOrigin: 'center bottom', opacity: 0 }),
    box('paper-next', 31, 51, 98, 30, soft, 0, { clipPath: 'polygon(0 0,100% 0,98% 100%,2% 100%)', transformOrigin: 'center bottom' }),
    box('box', 10, 81, 140, 55, paper, '18px 18px 8px 8px', { boxShadow: ring }, [box('box-bottom', 0, 29, 140, 26, muted, '0 0 8px 8px')]),
  ], [multi('paper-out', 3000, [{ offset: 0, transform: 'translateY(0) scale(1)', opacity: 1 }, { offset: .15, transform: 'translateY(-20%) scale(.9,1.2)', opacity: 1 }, { offset: .3, transform: 'translateY(-150%) scale(.8,1)', opacity: 0 }, { offset: 1, transform: 'translateY(-150%) scale(.8,1)', opacity: 0 }]),
    multi('paper-next', 3000, [{ offset: 0, transform: 'translateY(40%) scale(.6,.4)', opacity: 0 }, { offset: .25, transform: 'translateY(40%) scale(.6,.4)', opacity: 0 }, { offset: .45, transform: 'translateY(-10%) scale(1.05,1.15)', opacity: 1 }, { offset: .6, transform: 'translateY(0) scale(1)', opacity: 1 }, { offset: 1, transform: 'translateY(0) scale(1)', opacity: 1 }])]),

  'curtain': defineScene('curtain', 'Curtain', 'Curtain', 3200, 'A centre zipper rises as mirrored cloth corners curve away; the pull tab swings during travel.', [
    box('left-cloth', 12, 0, 66.3, 161.5, strong, 0),
    group('right-mirror', 81.7, 0, 66.3, 161.5, [box('right-cloth', 0, 0, 66.3, 161.5, strong, 0)], { transform: 'scaleX(-1)' }),
    group('zip-line-mask', 78.3, 0, 3.4, 161.5, [box('zip-line', 0, 0, 3.4, 145.35, muted, 0)], { overflow: 'hidden' }),
    group('zipper', 70.65, 118.66, 18.7, 23.8, [box('zip-head', 0, 0, 18.7, 23.8, accent, 5.1, { boxShadow: ring }), box('pull', 1.7, 14.62, 15.3, 30.6, soft, 5.95, { transformOrigin: 'center 6.8px', boxShadow: ring }, [dot('pull-hole', 4.25, 3.4, 6.8, paper)])]),
  ], [track('left-cloth', 3200, [0, .0667, .4, .5333, .8667, 1], ['0', '0', '0 0 85% 0', '0 0 85% 0', '0', '0'], 'borderRadius'), track('right-cloth', 3200, [0, .0667, .4, .5333, .8667, 1], ['0', '0', '0 0 85% 0', '0 0 85% 0', '0', '0'], 'borderRadius'),
    track('zip-line', 3200, [0, .0667, .3333, .5333, .8, 1], ['translateY(0)', 'translateY(0)', 'translateY(-136px)', 'translateY(-136px)', 'translateY(0)', 'translateY(0)']),
    track('zipper', 3200, [0, .0667, .3333, .5333, .8, 1], ['translateY(0)', 'translateY(0)', 'translateY(-136px)', 'translateY(-136px)', 'translateY(0)', 'translateY(0)']),
    track('pull', 3200, [0, .0667, .1333, .2, .2667, .3333, .5333, .6, .6667, .7333, .8, 1], ['rotate(0deg)', 'rotate(0deg)', 'rotate(8deg)', 'rotate(-6deg)', 'rotate(4deg)', 'rotate(0deg)', 'rotate(0deg)', 'rotate(8deg)', 'rotate(-6deg)', 'rotate(4deg)', 'rotate(0deg)', 'rotate(0deg)']),
  ]),
}
