# Design — send motion polish

## D1. Overlay-clone flight (HomePage)

On send (post-nextTick, bubbles in layout, `--enter` hides the real bubble):

1. Measure composer rect and the bubble's **final** viewport rect:
   `finalTop = bubbleRect.top - (targetScrollTop - currentScrollTop)` where
   `targetScrollTop = scrollHeight - clientHeight` (rows are already appended, so the final
   layout exists — same insight the current code relies on).
2. `bubble.cloneNode(true)` into a `position: fixed; pointer-events: none; z-index` layer at the
   composer's rect (sunk `FLIGHT_SINK_PX`), fly it to `finalTop` with the FLIGHT curve via WAAPI.
3. A single rAF watcher polls `animation.currentTime`: crossing `FLIGHT_SPLIT_MS` fires the
   composer recoil, crossing `FLIGHT_IMPACT_MS` fires knock + reveals the real bubble
   (`enteringMessages.delete`) + removes the clone. Watcher lifetime ≤ FLIGHT_MS; cancellation
   (newer send / reduced-motion) removes the clone immediately and reveals the bubble.
4. Scroll runs concurrently through the spring follower (D2) — no `SCROLL_TWEEN_MS * 0.7`
   sequencing anywhere.

Clone fidelity: the user bubble is text in a rounded box (`.HomePage-UserBubble`); clone the
`.HomePage-Message` subtree and pin its width to the measured rect to keep line wrapping
identical. Attachments trays ride along in the clone as-is.

Failure modes: bubble missing / rects degenerate / reduced motion → current fallback paths
(delete from enteringMessages, no clone). deltaY < 4 keeps its early-out.

## D2. Spring follower (tuffex use-stick-to-bottom)

Add a persistent critically-damped spring loop alongside the existing tween:

- State: `springV`, `springRaf`. `followIfSticking(glideMs)` with `glideMs > 0` retargets the
  spring instead of spawning a tween; the loop integrates
  `a = ω²·(target - y) - 2ω·v` (semi-implicit Euler, ω ≈ 14 → ~0.45s settle, no overshoot for
  scroll), re-reading `target` every frame; exits when `|err| < 0.5 && |v| < 20 px/s`.
- Wheel-up / `scrollToBottom` / a newer `tweenToBottom` kill the loop (existing `tweenSeq` bump
  pattern reused).
- `tweenToBottom` keeps its fixed-duration contract (exposed API, tests) but internally may ride
  the same integrator with a duration-derived ω; its Promise semantics (`landed: boolean`) are
  unchanged. The send path stops depending on its timing entirely.

## D3. Blur diet + gel

FLIGHT keyframes: drop the position-driven "fused" blur term above 4px; keep ≤3 keyframes of
small blur near launch OR replace with `scaleY` stretch riding `v` (already computed). Add
`will-change: transform, filter` to clone + knocked rows for first-frame promotion; remove after.

## D4. What stays

SPRING/IMPULSE tables, knock cascade (42ms/row delay, +15% duration dispersion, 4-row falloff),
arrival spring for replies, composer FLIP — all keep their character; only timing sources and
the blur budget change.

## Test strategy

- stick-to-bottom: spring retarget continuity (velocity non-zero across retargets), detach kills
  the loop, tweenToBottom contract intact (existing tests must stay green).
- HomePage choreography is DOM/WAAPI-heavy: assert structure (clone created/removed, beats fire
  in order via injected rAF/clock) where jsdom allows; the feel itself is user sign-off.
