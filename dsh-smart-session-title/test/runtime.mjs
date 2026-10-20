// Lasting test loader: resolve the real DSH runtime in place, never copy or install it.
//
// Set DSH_RUNTIME to an extracted DSH runtime directory (the `.scratch` mirror
// of the installed runtime is fine). Every bare `@deepseek-ai/*` or `zod`
// resolution of the plugin and its tests is then anchored at that runtime's
// package.json, so the checked-in plugin keeps zero local dependencies.
import { registerHooks } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

if (!process.env.DSH_RUNTIME) {
  throw new Error('Set DSH_RUNTIME to an extracted DSH runtime directory before running the tests')
}
const runtimeUrl = pathToFileURL(resolve(process.env.DSH_RUNTIME, 'package.json')).href

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@deepseek-ai/') || specifier === 'zod') {
      return next(specifier, { ...context, parentURL: runtimeUrl })
    }
    return next(specifier, context)
  },
})
