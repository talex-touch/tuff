/**
 * Prelude for json-formatter.
 *
 * The single feature is a `webcontent` interaction, so all work happens in the Surface
 * (`/json`). Nothing needs to run in the isolated Prelude — the previous version of this
 * file was a copy of the translation plugin's Prelude and only handled a `touch-translate`
 * feature id that this manifest never declares, so it was dead on every code path.
 */
module.exports = {}
