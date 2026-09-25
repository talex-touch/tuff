# Reference: @flohoeller "Chatbox component" — measured motion

- Video: https://x.com/flohoeller/status/2102660458658582913 ("Chat component interaction – made w/ Claude", 2026-09-23, 6.7s, 1090×1238, 60fps VFR, 337 frames).
- Static design it quotes: https://x.com/flohoeller/status/2100478630375628922 ("Chatbox component design", 2026-09-17, two 1760×1996 stills).
- Source files are not committed (third-party, unlicensed). Re-fetch them the way the `x-motion-reference-video-analysis` memory describes; working copies were in `/tmp/flo-motion/`.
- Every number below comes from per-frame pixel metrics: edge runs down pixel column x=1000, ink = mean of the darkest 2% of pixels in a label box, and sharpness = max horizontal gradient. They are not eyeballed. Video pixels ≈ 2× CSS px (retina capture), so 101 video px ≈ 50 CSS px.

## Static design (both stills)

- A white input card: placeholder "Start by typing…"; its toolbar row holds a `+` and a text action.
- The card sits on a flat light-grey **tray** that shows on one side of it:
  - still 1: tray below, "Connect apps" with three app icons;
  - still 2: tray above, "Select a project" with a folder icon.
- Still 2's toolbar action is a tinted chip, "Unrestricted access": peach fill, orange-red shield icon and text.
- The tray has no border or shadow. The card is the only raised surface (hairline ring plus a faint shadow).

## Motion 1 — tray swaps sides (bottom "Connect apps" → top "Select a project")

The outer bounds never move: the tray spans video y 414–831 in both end states. Only the card moves inside it.

| Phase | Time (s) | What happens |
|---|---|---|
| a. outgoing content leaves | 2.13 → 2.33 (~200ms) | "Connect apps" + icons fade to nothing with a slight blur; ink 126 → 235 on the tray grey, ease-out |
| b. card slides | 2.20 → 2.64 (~420ms, overlaps (a) by ~100ms) | card top edge 419 → 520 (101 video px ≈ one tray row); slow start, fast middle, long soft settle, **no overshoot** |
| c. incoming content | during (b) | "Select a project" is already in place at full opacity and is **uncovered** by the card moving away (the card acts as the mask). It is not faded in. |

Card top-edge samples (t → y): 2.217→420, 2.250→422, 2.283→426, 2.317→432, 2.333→437, 2.350→446, 2.367→453, 2.383→472, 2.400→480, 2.417→490, 2.433→497, 2.450→501, 2.483→507, 2.517→512, 2.550→515, 2.600→518, 2.650→520 (settled).

Normalised progress: 13% at 22% of the time, 52% at 41%, 77% at 52%, 92% at 70%, 98% at 89%. The motion is an ease-in-out with most of its travel front-loaded and a long tail. A critically damped spring does not fit (its tail is much longer), so pick the curve by fitting against these samples rather than by name.

## Motion 2 — hover on toolbar / tray text actions

- Ink only: grey (~#808080, ink 124–136) → near-black (ink ~40). There is no background plate and no scale change; the cursor becomes a pointer.
- Hover-in ~100–120ms (0.483 → 0.583), hover-out ~120ms (1.283 → 1.400); both ramp smoothly.
- ⚠ This conflicts with TuffEx design rule "Hover colour changes are immediate" (`.trellis/spec/frontend/tuffex-design-rules.md` › Motion).

## Motion 3 — state chip morph ("Request approval" → "Unrestricted access")

Total ~370ms (4.75 → 5.12):

- The old icon (hand) scales down and fades. The new icon (shield) scales up from about 0.5. The icon runs slightly ahead of the text (the shield is visible small at 4.87).
- The old label blurs and fades out in ~80ms (sharpness 121 → 16 over 4.75 → 4.83).
- The new label sharpens from a heavy blur in ~280ms (sharpness 16 → 141 over 4.85 → 5.12). Its colour moves grey → orange-red, with red ink appearing over 4.90 → 5.00.
- The pill's peach fill fades in from ~4.77, and its width follows the new label smoothly.
- Resting chip: tinted fill (warning/danger `-light-9`-style tint) with same-hue ink. This pairing matches the design rule "use the `-light-9` tint as fill with same-hue ink".

## What the reference does NOT show

- No streaming text, no message list, no send button (the video is cropped at the right edge).
- No dark theme. Everything is on a light page; the dark mapping is ours to design.
