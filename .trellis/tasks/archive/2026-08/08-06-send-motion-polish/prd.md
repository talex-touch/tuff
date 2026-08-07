# Send motion polish (iMessage-grade)

## Problem (user: "撞击动画不够丝滑,想想 iMessage 咋做的,要好看炫酷")

Current choreography (HomePage WAAPI springs + baked FLIGHT/IMPULSE curves + 42ms/row knock
cascade) is structurally good but stutters for four mechanical reasons:

1. **~196ms pre-flight queue**: flight launches at 70% of a 280ms scroll tween — reads as input
   lag. iMessage launches on press; make-room and flight are one gesture.
2. **Per-frame `blur()` radius changes** on a large bubble force re-rasterization every frame.
3. **Beats via `setTimeout`** (253/324ms offsets) drift 1-2 frames under load — recoil/knock
   desync from the visual landing.
4. **Streaming follow = restarted 220ms ease-out tweens**: velocity hits zero at each boundary →
   pulsing instead of one continuous glide.

Also two motion languages coexist (ease-out cubic scroll vs spring everything-else).

## Requirements

- R1: Flight launches immediately on send. Mechanism: overlay-clone bubble (fixed-position clone
  flies composer → precomputed final viewport position while the real bubble stays hidden until
  impact) — scroll and flight fully decoupled, iMessage's own trick.
- R2: Make-room scroll becomes a critically-damped spring follower (persistent velocity,
  per-frame retarget); the same follower replaces the streaming follow tweens. `tweenToBottom`
  API stays for compat.
- R3: Beats (split/recoil, impact/knock, reveal) fire from the flight driver's own timeline
  (rAF watcher on animation currentTime), not wall-clock setTimeout.
- R4: Blur diet: position-blur capped ≤4px with ≤3 keyframes or replaced by velocity `scaleY`
  gel; no per-frame radius ramps.
- R5: Reduced-motion paths preserved exactly (instant jump, no clone).
- R6: Curve language unified to the existing SPRING family (~0.5s response, mild overshoot).

## Acceptance Criteria

- [ ] No pre-flight delay perceivable (flight starts within one frame of Enter).
- [ ] Streaming reply reads as one continuous glide (no pulse); wheel-up still detaches instantly.
- [ ] Beats visually coincide with landing at 60fps and under induced jank.
- [ ] prefers-reduced-motion unchanged; stick-to-bottom tests extended for the spring follower.
- [ ] Final feel: user visual sign-off (subjective by nature — iterate).
