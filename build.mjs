// Build script — bundles src/main.js + dependencies into pkg/main.js
// Uses esbuild for fast, reliable bundling to CommonJS for Companion v4.

import { build } from 'esbuild'
import { cpSync, mkdirSync, writeFileSync, readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

mkdirSync('pkg/companion', { recursive: true })

const result = await build({
    entryPoints: ['src/main.js'],
    bundle:      true,
    platform:    'node',
    target:      'node22',        // match Companion's embedded Node version
    format:      'cjs',
    outfile:     'pkg/main.js',
    logLevel:    'info',
    metafile:    true,
    // @companion-module/base v2 uses conditional exports; tell esbuild which to pick
    conditions:  ['require', 'node', 'default'],
})

const inputs = Object.keys(result.metafile.inputs)
console.log(`Bundled ${inputs.length} input files into pkg/main.js`)
if (inputs.some(f => f.includes('@companion-module/base'))) {
    console.log('✓ @companion-module/base is bundled')
} else {
    console.log('⚠ @companion-module/base was NOT bundled — check node_modules')
}

cpSync('companion/manifest.json', 'pkg/companion/manifest.json')

writeFileSync('pkg/package.json', JSON.stringify({
    name:         pkg.name,
    version:      pkg.version,
    description:  pkg.description,
    license:      pkg.license,
    type:         'commonjs',
    main:         'main.js',
    dependencies: {},
}, null, 2))

// Marker file Companion looks for to recognise a pre-built package
writeFileSync('pkg/DEBUG-PACKAGED', '')

console.log('Build complete → pkg/')
