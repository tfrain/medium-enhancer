import assert from "node:assert/strict"

try {
  const { layoutQuote, normalizeQuote, quoteCardBranding, renderQuoteCard, findParagraphId } = await import('../src/shared/quote-card.ts')
  const { mediumPostId, buildParagraphLink, classifyMediumUrl } = await import('../src/shared/medium-url.ts')
  const measure = (text: string) => Array.from(text).length
  const wrapped = layoutQuote('one two three four five', 9, measure)
  assert.ok(wrapped.lines.length > 1)
  assert.ok(wrapped.lines.every(line => measure(line) <= 9))
  assert.equal(wrapped.lines.join(' '), 'one two three four five')
  assert.equal(wrapped.truncated, false)
  const limited = layoutQuote('one two three four five six seven', 9, measure, 2)
  assert.equal(limited.lines.length, 2)
  assert.ok(limited.lines.at(-1)?.endsWith('…'))
  assert.equal(limited.truncated, true)
  assert.ok(limited.lines.every(line => measure(line) <= 9))
  const capped = normalizeQuote('word '.repeat(200))
  assert.ok(capped.text.length <= 600)
  assert.ok(capped.text.endsWith('…'))
  assert.equal(capped.truncated, true)
  assert.equal(normalizeQuote(' a\n  b\t c ').text, 'a b c')
  for (const text of ['hello', 'a'.repeat(100), '你好世界'.repeat(12), '🙂'.repeat(25)]) {
    const result = layoutQuote(text, 9, measure)
    assert.ok(result.lines.length > 0)
    assert.ok(result.lines.every(line => measure(line) <= 9))
  }
  assert.deepEqual(layoutQuote('', 9, measure).lines, [])
  const article = { id: '', parentElement: null }
  const paragraph = { id: 'a1b2', parentElement: article }
  const inline = { id: 'inline', parentElement: paragraph }
  assert.equal(findParagraphId(inline, article), 'a1b2')
  assert.equal(findParagraphId({ id: 'abcd', parentElement: paragraph }, article), 'abcd', 'closest matching ancestor wins')
  assert.equal(findParagraphId({ id: 'ABCDE', parentElement: article }, article), '')
  const slug = 'https://medium.com/@writer/story-abcdef123456?source=x'
  const short = 'https://medium.com/p/abcdef123456'
  assert.equal(mediumPostId(slug), 'abcdef123456')
  assert.equal(mediumPostId(short), 'abcdef123456')
  assert.equal(classifyMediumUrl(short), 'article')
  assert.equal(mediumPostId(short + '/edit'), null)
  assert.equal(mediumPostId('https://medium.com/@writer-abcdef123456'), null)
  assert.equal(mediumPostId('https://medium.com/tag/topic-abcdef123456'), null)
  assert.equal(mediumPostId('https://medium.com/search/story-abcdef123456'), null)
  assert.equal(mediumPostId('https://itnext.io/a-story-abcdef123456'), 'abcdef123456')
  assert.equal(mediumPostId('https://medium.com/story-abcdef1234567'), null)
  assert.equal(mediumPostId('https://example.com/story-abcdef123456'), null)
  assert.equal(buildParagraphLink(slug, 'a1b2'), short + '#a1b2')
  for (const id of ['', 'not-hex', 'abcd1', 'ABCD']) assert.equal(buildParagraphLink(slug, id), slug)
  assert.equal(buildParagraphLink('https://medium.com/no-id', 'abcd'), 'https://medium.com/no-id')
  assert.deepEqual(quoteCardBranding(false), { watermark: true, attribution: true })
  assert.deepEqual(quoteCardBranding(true), { watermark: false, attribution: true })
  const drawn: { text: string; y: number }[] = []
  const ctx = {
    font: '', fillStyle: '', textBaseline: '',
    fillRect: () => {},
    fillText: (text: string, _x: number, y: number) => drawn.push({ text, y }),
    measureText: (text: string) => ({ width: Array.from(text).length * (parseFloat(ctx.font.match(/([0-9]+)px/)?.[1] || '20') * 0.55) }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
  }
  const canvas = { width: 0, height: 0, getContext: () => ctx } as any
  const data = { quote: 'word '.repeat(150), truncated: false, author: 'Test Author', title: 'Story Title', publication: 'Test Publication', link: short }
  for (const pro of [false, true]) {
    drawn.length = 0
    const rendered = renderQuoteCard(canvas, data, 'classic', 'landscape', pro)
    assert.equal(canvas.width, 1200)
    assert.equal(canvas.height, 675)
    assert.equal(rendered.truncated, true)
    for (const text of ['Test Author', 'Story Title', 'Test Publication · medium.com']) assert.ok(drawn.some(line => line.text === text))
    assert.equal(drawn.some(line => line.text === 'Made with Medium Enhancer'), !pro)
    assert.ok(drawn.every(line => line.y > 0 && line.y < 675), 'all text stays inside the card')
  }
  for (const size of ['square', 'portrait'] as const) {
    renderQuoteCard(canvas, data, 'dark', size, true)
    assert.equal(canvas.width, 1080)
    assert.equal(canvas.height, size === 'square' ? 1080 : 1350)
  }
  console.log('PASS quote wrapping/truncation, paragraph links, post IDs and mandatory branding')
} catch (error) {
  console.error('FAIL quote card:', error)
  process.exit(1)
}
