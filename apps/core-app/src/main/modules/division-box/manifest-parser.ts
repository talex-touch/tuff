/**
 * Manifest Parser for DivisionBox Configuration
 *
 * Re-exported from `main/shared/division-box-manifest-parser` so both DP5 (`plugin-loaders`)
 * and DP7 (`division-box`) share the pure stateless parser without an upper-triangular edge.
 */

export {
  getDefaultManifestConfig,
  mergeManifestWithRuntimeConfig,
  parseManifestDivisionBoxConfig
} from '../../shared/division-box-manifest-parser'
