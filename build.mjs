// Build script — copies source + dependencies into pkg/ for Companion v4.
// No bundling: avoids compatibility issues and keeps things simple.

import { cpSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

// Create output directories
mkdirSync('pkg/src', { recursive: true })
mkdirSync('pkg/companion', { recursive: true })
mkdirSync('pkg/node_modules', { recursive: true })

// Copy our source
cpSync('src/main.js', 'pkg/src/main.js')
console.log('✓ Copied src/main.js')

// Copy companion manifest + help
cpSync('companion/manifest.json', 'pkg/companion/manifest.json')
console.log('✓ Copied companion/manifest.json')
cpSync('companion/HELP.md', 'pkg/companion/HELP.md')
console.log('✓ Copied companion/HELP.md')

// Copy runtime dependencies (not devDeps) into pkg/node_modules
const deps = Object.keys(pkg.dependencies || {})
console.log(`Copying dependencies: ${deps.join(', ')}`)
for (const dep of deps) {
    const src = `node_modules/${dep}`
    const dst = `pkg/node_modules/${dep}`
    if (existsSync(src)) {
        cpSync(src, dst, { recursive: true })
        console.log(`  ✓ ${dep}`)
    } else {
        console.error(`  ✗ MISSING: ${dep} — run npm install first`)
        process.exit(1)
    }
}

// Also copy transitive deps of @companion-module/base (tslib, colord, ajv-formats, etc.)
const transitiveDeps = ['tslib', 'colord', 'ajv', 'ajv-formats', 'fast-deep-equal']
for (const dep of transitiveDeps) {
    const src = `node_modules/${dep}`
    const dst = `pkg/node_modules/${dep}`
    if (existsSync(src)) {
        cpSync(src, dst, { recursive: true })
        console.log(`  ✓ ${dep} (transitive)`)
    }
}

// Write pkg/package.json
writeFileSync('pkg/package.json', JSON.stringify({
    name:    pkg.name,
    version: pkg.version,
    license: pkg.license,
    type:    'module',
    main:    'src/main.js',
}, null, 2))
console.log('✓ Wrote pkg/package.json')

// DEBUG-PACKAGED marker — Companion uses this to recognise a pre-built package
writeFileSync('pkg/DEBUG-PACKAGED', '')
console.log('✓ Wrote DEBUG-PACKAGED')

console.log('\nBuild complete → pkg/')
