// Build script — bundles src/main.js into pkg/main.js for Companion v4

import { build } from 'esbuild'
import { cpSync, mkdirSync, writeFileSync, readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

mkdirSync('pkg/companion', { recursive: true })

// Output as ESM — avoids CJS conversion issues with @companion-module/base v2.
// Companion runs modules under Node 22 which fully supports native ESM.
const result = await build({
    entryPoints: ['src/main.js'],
    bundle:      true,
    platform:    'node',
    target:      'node22',
    format:      'esm',
    outfile:     'pkg/main.js',
    logLevel:    'info',
    metafile:    true,
})

const inputs = Object.keys(result.metafile.inputs)
console.log(`Bundled ${inputs.length} input files into pkg/main.js`)
if (inputs.some(f => f.includes('@companion-module/base'))) {
    console.log('✓ @companion-module/base is bundled')
} else {
    console.log('⚠ @companion-module/base was NOT bundled — check node_modules')
}

cpSync('companion/manifest.json', 'pkg/companion/manifest.json')

// pkg/package.json — "type":"module" so Node treats main.js as ESM
writeFileSync('pkg/package.json', JSON.stringify({
    name:         pkg.name,
    version:      pkg.version,
    description:  pkg.description,
    license:      pkg.license,
    type:         'module',
    main:         'main.js',
    dependencies: {},
}, null, 2))

// Marker Companion uses to recognise a pre-built package
writeFileSync('pkg/DEBUG-PACKAGED', '')

console.log('Build complete → pkg/')
