// Build script — bundles index.js + dependencies into a single pkg/main.js
// that Companion v4 can import directly (CommonJS, no node_modules needed).

import { build } from 'esbuild'
import { cpSync, mkdirSync, writeFileSync, readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

mkdirSync('pkg/companion', { recursive: true })

// Bundle everything into one CJS file
const result = await build({
    entryPoints: ['index.js'],
    bundle:      true,
    platform:    'node',
    target:      'node18',
    format:      'cjs',
    outfile:     'pkg/main.js',
    logLevel:    'info',
    metafile:    true,
})

// Show what was bundled
const inputs = Object.keys(result.metafile.inputs)
console.log(`Bundled ${inputs.length} input files into pkg/main.js`)
if (inputs.some(f => f.includes('@companion-module/base'))) {
    console.log('✓ @companion-module/base is bundled')
} else {
    console.log('⚠ @companion-module/base was NOT bundled — check node_modules')
}

// Copy manifest
cpSync('companion/manifest.json', 'pkg/companion/manifest.json')

// Write a minimal package.json for the bundled output
writeFileSync('pkg/package.json', JSON.stringify({
    name:         pkg.name,
    version:      pkg.version,
    description:  pkg.description,
    license:      pkg.license,
    type:         'commonjs',
    main:         'main.js',
    dependencies: {},
}, null, 2))

console.log('Build complete → pkg/')
