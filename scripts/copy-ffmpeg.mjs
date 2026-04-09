/**
 * Copies @ffmpeg/core-mt WASM files and @ffmpeg/ffmpeg worker files from
 * node_modules into public/ffmpeg/ so they are served as same-origin static
 * files by Next.js, bypassing webpack bundling entirely.
 *
 * WHY @ffmpeg/core-mt instead of @ffmpeg/core:
 *   The single-threaded @ffmpeg/core build has a fixed WASM linear memory
 *   limit that causes "RuntimeError: memory access out of bounds" on files
 *   larger than a few MB. The multi-threaded @ffmpeg/core-mt build uses
 *   SharedArrayBuffer for its WASM heap and can handle files up to the
 *   browser's available RAM. SharedArrayBuffer is available because the app
 *   sets COEP: credentialless and COOP: same-origin in next.config.ts.
 *
 * WHY classWorkerURL:
 *   @ffmpeg/ffmpeg creates a Web Worker from its bundled worker.js. When
 *   webpack bundles that worker, dynamic `import(_coreURL)` calls (where the
 *   URL is a runtime value) get transformed into webpack's module resolver,
 *   which cannot load arbitrary same-origin paths like /ffmpeg/ffmpeg-core.js.
 *   By serving worker.js + its dependencies from public/ and passing
 *   classWorkerURL to ffmpeg.load(), webpack never bundles the worker — the
 *   browser loads it as a native module worker and native import() works fine.
 *
 * Run automatically via "postinstall" in package.json, or manually:
 *   node scripts/copy-ffmpeg.mjs
 */
import { copyFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const dest = resolve(root, 'public/ffmpeg')

mkdirSync(dest, { recursive: true })

// ── @ffmpeg/core-mt WASM files ────────────────────────────────
// The -mt build adds ffmpeg-core.worker.js for WASM thread support.
const coreSrc = resolve(root, 'node_modules/@ffmpeg/core-mt/dist/esm')
if (!existsSync(coreSrc)) {
  console.error('[copy-ffmpeg] @ffmpeg/core-mt not found. Run npm install first.')
  process.exit(1)
}
for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-core.worker.js']) {
  copyFileSync(resolve(coreSrc, file), resolve(dest, file))
  console.log(`[copy-ffmpeg] Copied @ffmpeg/core-mt → public/ffmpeg/${file}`)
}

// ── @ffmpeg/ffmpeg worker + its ESM dependencies ─────────────
// The worker is served raw from public/ so webpack never bundles it.
// It uses ES module imports from ./const.js and ./errors.js, which
// must also be present in the same directory.
const ffmpegSrc = resolve(root, 'node_modules/@ffmpeg/ffmpeg/dist/esm')
if (!existsSync(ffmpegSrc)) {
  console.error('[copy-ffmpeg] @ffmpeg/ffmpeg not found. Run npm install first.')
  process.exit(1)
}

// Copy worker.js as ffmpeg-worker.js so the name is unambiguous
copyFileSync(resolve(ffmpegSrc, 'worker.js'), resolve(dest, 'ffmpeg-worker.js'))
console.log('[copy-ffmpeg] Copied @ffmpeg/ffmpeg worker.js → public/ffmpeg/ffmpeg-worker.js')

// The worker imports "./const.js" and "./errors.js" — copy them too
for (const file of ['const.js', 'errors.js']) {
  copyFileSync(resolve(ffmpegSrc, file), resolve(dest, file))
  console.log(`[copy-ffmpeg] Copied @ffmpeg/ffmpeg ${file} → public/ffmpeg/${file}`)
}
