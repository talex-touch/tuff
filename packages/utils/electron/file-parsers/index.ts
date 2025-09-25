import { fileParserRegistry } from './registry'
import { textFileParser } from './parsers/text-parser'

fileParserRegistry.register(textFileParser)

export * from './types'
export * from './registry'
export { textFileParser }
