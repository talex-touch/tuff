import type { MarkedExtension } from 'marked'
import { isRemoteImage, isRemoteImageAllowed } from './remote-image-policy'

/**
 * Attribute hardening for links and images in model-authored markdown.
 *
 * The navigation boundary already exists elsewhere: the host intercepts
 * `will-navigate` and puts the URL through a protocol allow-list, and the
 * sanitizer drops `target` outright. What is left are the leaks that happen
 * without a click:
 *
 * - An image loads the moment it renders. A remote `src` is therefore a beacon
 *   reporting the reader's IP, and nothing about the markdown asked them first.
 * - A link that ever does navigate carries a `Referer` unless told not to.
 *
 * Written against marked 12's positional renderer signature `(href, title,
 * text)`. Marked 13 changed these to token objects — a bump has to revisit
 * this file, which is why the signature is asserted in the tests.
 */

/**
 * Escapes a value for insertion into a double-quoted HTML attribute.
 *
 * Applied to the href alone. Marked hands `title` and the link text / image alt
 * already HTML-escaped, but hands the href raw — measured, not assumed. Running
 * this over the escaped ones turns `&quot;` into `&amp;quot;`, which the reader
 * sees verbatim.
 */
function escapeHref(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Labels the injected chrome needs. TuffEx has no i18n; the host supplies wording. */
export interface HardenHtmlLabels {
  blockedImage: string
  loadOnce: string
  allowSession: string
  copyTable: string
}

export interface HardenHtmlOptions {
  /** When false the policy is bypassed entirely and images render as authored. */
  blockRemoteImages: boolean
  labels: HardenHtmlLabels
}

/**
 * The blocked-image placeholder.
 *
 * Rendered as markup rather than as a Vue component because blocks reach the
 * DOM through `v-html`; the component attaches one delegated listener and reads
 * these data attributes. `alt` is shown in full — a reader deciding whether to
 * fetch something needs to know what it claims to be.
 */
function blockedImagePlaceholder(src: string, alt: string, labels: HardenHtmlLabels): string {
  const safeSrc = escapeHref(src)
  return (
    `<span class="tx-stream-md__blocked-image" data-tx-blocked-image="${safeSrc}">` +
    `<span class="tx-stream-md__blocked-image-icon" aria-hidden="true">🚫</span>` +
    `<span class="tx-stream-md__blocked-image-body">` +
    `<span class="tx-stream-md__blocked-image-title">${labels.blockedImage}</span>` +
    `${alt ? `<span class="tx-stream-md__blocked-image-alt">${alt}</span>` : ''}` +
    `<span class="tx-stream-md__blocked-image-src">${safeSrc}</span>` +
    `</span>` +
    `<span class="tx-stream-md__blocked-image-actions">` +
    `<button type="button" data-tx-image-action="once">${labels.loadOnce}</button>` +
    `<button type="button" data-tx-image-action="session">${labels.allowSession}</button>` +
    `</span>` +
    `</span>`
  )
}

export function hardenHtmlExtension(options: () => HardenHtmlOptions): MarkedExtension {
  return {
    renderer: {
      /**
       * Tables get a wrapper because a table cannot own a scroll box or host a
       * button by itself.
       *
       * The scroll container is the wrapper, not the table: making the *table*
       * scrollable would leave `position: sticky` on its header resolving
       * against the transcript's scroller, so the header would peel off and
       * float over the whole conversation. Contained here, both the horizontal
       * scroll and the sticky header stay inside the message they belong to.
       */
      table(header: string, body: string): string {
        const rows = body ? `<tbody>${body}</tbody>` : ''
        return (
          `<div class="tx-stream-md__table-wrap">` +
          `<div class="tx-stream-md__table-scroll">` +
          `<table><thead>${header}</thead>${rows}</table>` +
          `</div>` +
          `<button type="button" class="tx-stream-md__table-copy" data-tx-table-copy>` +
          `${options().labels.copyTable}</button>` +
          `</div>`
        )
      },
      // `text` arrives already parsed as inline HTML, so it is passed through
      // untouched: escaping it here would show the reader literal tags.
      link(href: string, title: string | null | undefined, text: string): string {
        const titleAttr = title ? ` title="${title}"` : ''
        // `noreferrer` implies `noopener`; both are named because that pair is
        // what a reviewer looks for, and one without the other is a common slip.
        return `<a href="${escapeHref(href)}"${titleAttr} rel="noopener noreferrer">${text}</a>`
      },
      image(href: string, title: string | null | undefined, text: string): string {
        const { blockRemoteImages, labels } = options()
        const alt = text ?? ''
        if (blockRemoteImages && isRemoteImage(href) && !isRemoteImageAllowed(href)) {
          return blockedImagePlaceholder(href, alt, labels)
        }

        const titleAttr = title ? ` title="${title}"` : ''
        // `alt` is load-bearing, not decorative: a blocked or slow image leaves
        // the reader with nothing else to go on.
        const altAttr = ` alt="${alt}"`
        // `lazy` is a mitigation as much as an optimisation: an image below the
        // fold never fetches, so it never beacons unless the reader scrolls to
        // it. `no-referrer` stops the request naming where it came from.
        return `<img src="${escapeHref(href)}"${altAttr}${titleAttr} loading="lazy" decoding="async" referrerpolicy="no-referrer">`
      }
    }
  }
}
