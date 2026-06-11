// Build script — bundles index.js + dependencies into a single pkg/main.js
// that Companion v4 can import directly (CommonJS, no node_modules needed).

import { build } from 'esbuild'
import { cpSync, mkdirSync, writeFileSync, readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

mkdirSync('pkg/companion', { recursive: true })

// Bundle everything into one CJS file
await build({
    entryPoints: ['index.js'],
    bundle:      true,
    platform:    'node',
    target:      'node22',
    format:      'cjs',
    outfile:     'pkg/main.js',
    logLevel:    'info',
})

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
