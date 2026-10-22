import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// AGENTS.md §3: never write user data into the Medium page DOM. The self-cite
// panel is appended to document.body, where page scripts can read it; it used to
// print each story's earnings (2026-10-22 review).
const src = readFileSync(new URL('../src/contents/ui/self-cite-panel.ts', import.meta.url), 'utf8')
// Sorting by revenueUsd in memory is fine; formatting it for display is not.
assert.ok(!/revenueUsd\.toFixed|\$\$\{/.test(src), 'self-cite panel must not render earnings into the page')
console.log('PASS self-cite panel keeps earnings out of the page DOM')
