import assert from 'node:assert/strict'
import { loadSource } from './load-source.ts'

for (const navigateAt of ['status', 'save', 'none']) {
  const url = 'https://medium.com/p/abcdef123456'
  const location = { href: url }
  const sent: any[] = []
  const paragraph = { id: 'abcd', closest: () => null }
  const { highlightCurrentStory } = loadSource('src/contents/lib/bookshelf.ts', {
    Node: { ELEMENT_NODE: 1 },
    window: { location, getSelection: () => ({ rangeCount: 1, isCollapsed: false, toString: () => 'selected', getRangeAt: () => ({ startContainer: { nodeType: 3, parentElement: paragraph } }) }) },
    document: { querySelector: (s: string) => s === 'article' ? { querySelector: () => ({ textContent: 'Title' }) } : null },
  }, {
    './quote-card': { getCustomMediumHosts: () => [], quoteStoryRoot: () => ({}), readQuoteCard: () => ({}) },
    '../markdown/medium-to-markdown': {},
    '../../shared/bookshelf-client': { bookshelfRequest: async (message: any) => {
      sent.push(message)
      if (message.action === navigateAt) location.href = 'https://medium.com/p/111111111111'
      return { saved: navigateAt !== 'save', enabled: true, pro: false }
    } },
  })
  if (navigateAt === 'none') {
    await highlightCurrentStory()
    assert.equal(sent.at(-1).url, url)
  } else {
    await assert.rejects(highlightCurrentStory(), /changed/i, `abort after ${navigateAt}`)
    assert.ok(!sent.some(m => m.action === 'highlight'))
    if (navigateAt === 'status') assert.equal(sent.length, 1)
  }
}
console.log('PASS highlight aborts navigation after status/save and submits captured URL')
