/**
 * Props for {@link TxVoiceClip}.
 *
 * @public
 */
export interface VoiceClipProps {
  /**
   * The recording: a `blob:`, `tfile:` or `https:` URL. Empty leaves the clip unavailable — the
   * play key is disabled and `unavailableLabel` stands in for the waveform. A source the element
   * cannot load ends in the same state, with an `error` event.
   */
  src?: string

  /**
   * Length in milliseconds when the host already knows it, so the clip has its width and its
   * time before the element has read the file. The element's own duration wins once it has one.
   */
  durationMs?: number

  /**
   * Amplitudes in `0..1`, resampled to however many bars fit. Omitted, the clip decodes a local
   * `src` (`blob:`, `data:`, `tfile:`, `file:`) once and caches the result per URL; a remote one is
   * not fetched a second time. Until peaks land, or when there are none, the bars sit flat at
   * their minimum height rather than drawing a waveform the recording does not have.
   */
  peaks?: readonly number[]

  /** @default false */
  disabled?: boolean

  /** Accessible name of the play key. @default 'Play voice message' */
  playLabel?: string

  /** Accessible name of the play key while it pauses. @default 'Pause voice message' */
  pauseLabel?: string

  /** Accessible name of the waveform slider. @default 'Playback position' */
  seekLabel?: string

  /** Shown in place of the waveform while there is nothing to play. @default 'Recording unavailable' */
  unavailableLabel?: string
}

/**
 * Methods exposed on a {@link TxVoiceClip} instance.
 *
 * @public
 */
export interface VoiceClipExpose {
  /** Starts playback from where it stands, or from the start once it has ended. */
  play: () => Promise<void>
  pause: () => void
  toggle: () => void
}
