// Ported from torph/src/lib/utils/constants.ts (https://github.com/lochie/torph).
// MIT License © lochie. Kept intentionally close to upstream so its fixes stay
// diffable; the only deviation is the `tx-morph-*` attribute prefix.

export const ATTR_ROOT = 'tx-morph-root'
export const ATTR_ITEM = 'tx-morph-item'
export const ATTR_ID = 'tx-morph-id'
export const ATTR_KIND = 'tx-morph-kind'
export const ATTR_SLOT = 'tx-morph-slot'
export const ATTR_EXITING = 'tx-morph-exiting'
/** Not a segment — every walk of root.children skips it. */
export const ATTR_SR = 'tx-morph-sr'
export const ATTR_DEBUG = 'tx-morph-debug'
export const EMPTY_ID = 'empty'
