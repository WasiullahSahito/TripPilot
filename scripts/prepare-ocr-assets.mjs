import { createRequire } from 'node:module'
import { mkdir, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const targetDir = path.join(root, 'public', 'tesseract')
const languages = ['eng', 'ara', 'fra', 'spa', 'deu', 'rus', 'tur', 'hin', 'chi_sim', 'jpn']
const cores = [
  'tesseract-core-relaxedsimd-lstm',
  'tesseract-core-simd-lstm',
  'tesseract-core-lstm',
]

async function copyPackageFile(packageName, sourcePath, outputName = path.basename(sourcePath)) {
  const packageJson = require.resolve(`${packageName}/package.json`)
  const source = path.join(path.dirname(packageJson), sourcePath)
  await copyFile(source, path.join(targetDir, outputName))
}

await mkdir(targetDir, { recursive: true })
await copyPackageFile('tesseract.js', 'dist/worker.min.js')

for (const core of cores) {
  await copyPackageFile('tesseract.js-core', `${core}.wasm.js`)
  await copyPackageFile('tesseract.js-core', `${core}.wasm`)
}

for (const language of languages) {
  await copyPackageFile(
    `@tesseract.js-data/${language}`,
    `4.0.0_best_int/${language}.traineddata.gz`,
  )
}

console.log(`Prepared local Tesseract assets for ${languages.length} OCR languages in public/tesseract.`)
