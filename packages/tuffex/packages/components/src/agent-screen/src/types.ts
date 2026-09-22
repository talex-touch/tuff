/**
 * Types for TxAgentScreen — a framed view of what an agent is looking at.
 *
 * Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
 *
 * @public
 */

/**
 * What the frame is currently showing.
 *
 * - `working`: the frame's content is live.
 * - `loading`: a shimmer placeholder stands in for a frame not yet received.
 *
 * @public
 */
export type AgentScreenState = 'working' | 'loading'

/**
 * Agent pointer position, as a percentage of the frame's own box.
 *
 * Percentages rather than pixels: the frame is responsive and a captured
 * pointer coordinate is only meaningful relative to the capture it came from.
 *
 * @public
 */
export interface AgentScreenCursor {
  /** 0–100, left to right. */
  x: number
  /** 0–100, top to bottom. */
  y: number
  /** Optional label rendered beside the pointer, e.g. the current action. */
  label?: string
}

/**
 * Props for the TxAgentScreen component.
 *
 * @public
 */
export interface AgentScreenProps {
  /**
   * Image source for the frame. Ignored when the default slot is filled, which
   * is how a host mounts a live surface (canvas, video, iframe) instead.
   */
  src?: string

  /**
   * Accessible description of the frame. Required whenever `src` is set —
   * a screenshot of someone else's screen is content, not decoration.
   */
  alt?: string

  /** Caption under the frame. Omit to render no caption. */
  label?: string

  /**
   * @default 'working'
   */
  state?: AgentScreenState

  /** Agent pointer overlay. Omit to hide it. */
  cursor?: AgentScreenCursor

  /**
   * CSS `aspect-ratio` for the frame. The default is the upstream capture's
   * own ratio.
   * @default '2964 / 1856'
   */
  ratio?: string

  /**
   * Accessible name for the whole region.
   * @default 'Agent screen'
   */
  ariaLabel?: string

  /**
   * Text announced while `state` is `loading`.
   * @default 'Waiting for the agent’s screen'
   */
  loadingLabel?: string
}
