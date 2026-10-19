import assert from 'node:assert/strict'
import { loadSource } from './load-source.ts'

const text = (value: string) => ({ nodeType: 3, textContent: value })
const element = (tagName: string, childNodes: any[] = []): any => ({
  nodeType: 1, tagName, childNodes,
  get textContent() { return childNodes.map(child => child.textContent || '').join('') },
  closest: () => null, getAttribute: () => '', matches: () => false,
  remove() { article.children = article.children.filter(child => child !== this) },
})
const opening = 'Opening body paragraph that must stay in the body rather than becoming an invented subtitle '.repeat(2)
const heading = element('H1', [text('A story without a subtitle')])
const paragraph = element('P', [text(opening)])
const byline = element('P', [text('Jane Doe')])
const code = element('PRE', [text('first()'), element('BR'), text('second()')])
const article = {
  children: [heading, byline, paragraph, code],
  cloneNode() { return this },
  querySelector: (selector: string) => selector === 'h1' ? heading : null,
  querySelectorAll: () => [byline, paragraph],
}
const sourceUrl = 'https://medium.programmerscareer.com/a-story-6f440119587f'
const document = {
  title: 'A story without a subtitle',
  querySelector: (selector: string) => selector === 'article' ? article
    : selector === 'meta[property="og:site_name"]' ? { content: 'Medium' }
    : selector === 'meta[name="description"]' ? { content: opening } : null,
  querySelectorAll: () => [],
}
try {
  const { clipCurrentMediumArticleAsMarkdown } = loadSource('src/contents/markdown/medium-to-markdown.ts', {
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 }, document,
    window: { location: { href: sourceUrl, hostname: 'medium.programmerscareer.com' } },
  }, { '../lib/extract': { extractArticle: () => { throw new Error('Medium story should use its article DOM') } } })
  const clip = clipCurrentMediumArticleAsMarkdown()
  assert.equal(clip.sourceUrl, sourceUrl)
  assert.ok(!clip.markdown.includes('subtitle:'), 'no subtitle frontmatter without an explicit signal')
  assert.ok(!clip.markdown.includes('## '), 'no invented subtitle heading')
  assert.ok(clip.markdown.includes(opening.trim()))
  assert.ok(clip.markdown.includes('Jane Doe'), 'byline is not promoted or removed')
  assert.ok(clip.markdown.includes('```\nfirst()\nsecond()\n```'))
  console.log('PASS custom-domain Markdown export keeps opening body/byline and PRE line breaks without inventing a subtitle')
} catch (error) {
  console.error('FAIL Markdown story:', error)
  process.exit(1)
}
