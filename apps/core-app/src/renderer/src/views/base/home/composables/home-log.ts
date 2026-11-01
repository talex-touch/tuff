import { createRendererLogger } from '~/utils/renderer-log'

/** One logger for every Home composable, so a log line carries the same tag wherever it came from. */
export const homeLog = createRendererLogger('HomeConversation')
