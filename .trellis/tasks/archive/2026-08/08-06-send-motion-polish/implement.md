# Implement — send motion polish

## tuffex

- [x] 1. `use-stick-to-bottom.ts`: spring follower (state, integrator, kill paths); route
       `followIfSticking(glideMs>0)` through it; keep `tweenToBottom` contract.
- [x] 2. `stick-to-bottom.test.ts`: velocity continuity across retargets; detach kill;
       existing cases green.
- [x] 3. tuffex build + vue-tsc.

## core-app (HomePage.vue)

- [x] 4. Overlay layer + clone factory; flight WAAPI on the clone; rAF beat watcher
       (split→recoil, impact→knock+reveal+cleanup); cancellation path.
- [x] 5. Remove `SCROLL_TWEEN_MS*0.7` sequencing; send() = spring follow + immediate flight;
       placeholder entrance timing now relative to impact event.
- [x] 6. Blur diet + `will-change` hints; reduced-motion audit of every new path.
- [ ] 7. typecheck web; manual feel pass with the user (record verdicts in task).

Rollback: tuffex step 1 and HomePage steps 4-6 are independently revertible per file.

## Outcome (2026-08-07)

Mechanical rework done: spring follower (ω=22, velocity-continuous retarget; 3 new tests),
overlay-clone flight with rAF-clock beats (split→recoil, impact→knock, finish→swap), blur
removed from FLIGHT (stretch bumped 0.10→0.14 vertical to carry the energy), will-change
promotion on clone + knocked rows with release. Step 7's "manual feel pass" awaits the user —
curves (FLIGHT/SPRING/IMPULSE tables, ω, knock amplitudes) are data and tunable per verdict.
