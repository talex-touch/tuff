// The build gulpfile is TypeScript, so the runner needs a TS loader. `--loader`
// is the deprecated flag Node warns about and plans to remove; this is the
// supported entry point it points at, keeping ts-node as the transformer so the
// emitted bundle is unchanged.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('ts-node/esm', pathToFileURL('./'))
