import assert from 'node:assert/strict'
import { loadSource } from './load-source.ts'
const url = 'https://medium.com/@writer/story-abcdef123456'
let pro = false
let saved = false
let conversionFails = false
let conversions = 0
const sent: any[] = []
const paragraph = { id: 'abcd', parentElement: null, closest: () => null }
const start = { nodeType: 3, parentElement: paragraph }
const selection = { rangeCount: 1, isCollapsed: false, toString: () => 'A long selection '.repeat(100), getRangeAt: () => ({ startContainer: start }) }
const { saveCurrentStory, highlightCurrentStory } = loadSource('src/contents/lib/bookshelf.ts', {
  Node: { ELEMENT_NODE: 1 },
  window: { location: { href: url }, getSelection: () => selection },
  document: { title: 'Fallback title', querySelector: (selector: string) => selector === 'article' ? { querySelector: () => ({ textContent: 'A story' }) } : null },
}, {
  '../../shared/bookshelf-client': { bookshelfRequest: async (message: any) => {
    sent.push(message)
    return message.action === 'status' ? { pro, saved, enabled: true } : { ok: true, archived: pro }
  } },
  './quote-card': { readQuoteCard: () => ({ link: url }), quoteStoryRoot: () => ({}) },
  '../markdown/medium-to-markdown': { clipCurrentMediumArticleAsMarkdown: () => {
    conversions++
    if (conversionFails) throw new Error('Cannot read body')
    return { markdown: 'Current rendered body' }
  } },
})
await saveCurrentStory()
assert.equal(conversions, 0, 'free saves never run full-text conversion')
assert.equal(sent.at(-1).metadata.title, 'A story')
assert.equal(sent.at(-1).markdown, undefined)
pro = true
await saveCurrentStory()
assert.equal(conversions, 1)
assert.equal(sent.at(-1).markdown, 'Current rendered body')
await assert.rejects(() => saveCurrentStory(true), /save/i)
saved = true
await saveCurrentStory(true)
assert.equal(sent.at(-1).archiveOnly, true)
await highlightCurrentStory()
assert.equal(sent.at(-1).text.length, 1699, 'private highlight keeps long selections without quote-card truncation')
assert.equal(sent.at(-1).paragraphId, 'abcd')
await assert.rejects(() => saveCurrentStory(true, '111111111111'), /changed|story/i)
conversionFails = true
const result = await saveCurrentStory()
assert.match(result.warning, /Cannot read body/)
assert.equal(sent.at(-1).markdown, undefined, 'failed capture still saves metadata')
await assert.rejects(() => saveCurrentStory(true), /Cannot read body/)
console.log('PASS Bookshelf current-page conversion, free metadata-only save, archive-only errors and full selection highlights')
