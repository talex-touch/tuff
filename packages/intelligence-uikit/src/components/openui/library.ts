import OpenUIPrimitive from './OpenUIPrimitive'
import { createOpenUILibrary } from './definitions'

/** Renderer-bound OpenUI library. Definitions and prompt metadata live in the pure factory. */
export const library = createOpenUILibrary(OpenUIPrimitive)
