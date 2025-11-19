import { textFileParser } from './parsers/text-parser'
import { fileParserRegistry } from './registry'

fileParserRegistry.register(textFileParser)

export * from './registry'
export * from './types'
export { textFileParser }
