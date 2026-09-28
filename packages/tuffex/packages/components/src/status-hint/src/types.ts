import type { StatusTone } from '../../status-badge/src/types'

/**
 * Size tier of {@link TxStatusHint}. `md` (13px text, 16px icon) is a status line of its own;
 * `sm` (12px text, 14px icon) sits in a toolbar or a header beside other controls.
 *
 * @public
 */
export type StatusHintSize = 'sm' | 'md'

/**
 * Props for {@link TxStatusHint}.
 *
 * @public
 */
export interface StatusHintProps {
  /**
   * The message, one short line. While `animated`, it renders through `TxTextTransformer`'s
   * morph, so a new value morphs out of the old one character by character. A value too long
   * for the box fades out at its end instead of being cut.
   */
  text: string | number

  /**
   * Hue of the wash and the icon. `info` reads the primary hue, as it does in
   * `TxStatusBadge`; `muted` is a neutral grey and has no default icon.
   *
   * @default 'success'
   */
  tone?: StatusTone

  /** @default 'md' */
  size?: StatusHintSize

  /**
   * Replays the emphasis when it changes after mount. Pass the id of each message, so the
   * same text arriving again still reads as new. A change of `text` replays it as well;
   * both changing in one update replay it once.
   */
  pulseKey?: string | number

  /**
   * `false` renders the end state at once: no entrance, no replay, and the text as plain
   * text without the morph engine. Hosts wire their own motion switch here (low battery, an
   * app setting); `prefers-reduced-motion: reduce` has the same effect without it.
   *
   * @default true
   */
  animated?: boolean

  /**
   * `true` makes the text a polite live region (`role="status"`). Pass `false` when the host
   * announces the message from a region of its own: the component then contains no live
   * region at all. A live region inserted already filled is not announced by every screen
   * reader, so a host that mounts the hint together with its message should own an
   * always-mounted announcer and pass `false`.
   *
   * @default true
   */
  live?: boolean
}
