import assert from 'node:assert/strict'
import { loadSource } from './load-source.ts'

let article = true
let canonical = ''
let siteName = ''
let appLink = ''
let links: string[] = []
let anchors: string[] = []
const document = {
  querySelector: (selector: string) => selector === 'article' ? (article ? {} : null)
    : selector === 'link[rel="canonical"]' ? { href: canonical }
    : { content: siteName },
  querySelectorAll: (selector: string) => selector.startsWith('meta') ? [{ content: appLink }]
    : (selector === 'a[href]' ? anchors : links).map(href => ({ href })),
}
try {
  const { inspectMediumPage } = loadSource('src/shared/medium-page.ts', { document, location: { origin: 'https://pub.huizhou92.com' } })
  appLink = 'medium://p/6f440119587f'
  links = ['https://medium.programmerscareer.com/feed', 'https://medium.programmerscareer.com/feed', 'javascript:alert(1)']
  assert.equal(inspectMediumPage().isMediumStory, true, 'Medium app metadata identifies a custom-domain story')
  assert.equal(JSON.stringify(inspectMediumPage().feeds), '["https://medium.programmerscareer.com/feed"]', 'only declared HTTP feeds are trusted')
  appLink = ''
  siteName = 'Medium'
  assert.equal(inspectMediumPage().isMediumStory, true)
  siteName = ''
  canonical = 'https://medium.com/p/6f440119587f'
  assert.equal(inspectMediumPage().isMediumStory, true)
  canonical = 'https://medium.com.evil.test/p/6f440119587f'
  assert.equal(inspectMediumPage().isMediumStory, false)
  appLink = 'other://p/6f440119587f'
  assert.equal(inspectMediumPage().isMediumStory, false, 'ordinary pages with declared feeds are not Medium stories')
  assert.deepEqual(JSON.parse(JSON.stringify(inspectMediumPage().feeds)), [], 'non-Medium pages return no feeds, even with declarations')
  siteName = 'Medium'
  article = false
  assert.equal(inspectMediumPage().isMediumStory, false, 'require story DOM as well as metadata')
  article = true
  links = []
  anchors = ['https://evil.test/@evil', 'https://medium.com/@bad%20name', 'https://medium.com/@hxzhouh/following?source=x', 'https://medium.com/@second']
  assert.deepEqual(JSON.parse(JSON.stringify(inspectMediumPage().feeds)), ['https://pub.huizhou92.com/feed', 'https://medium.com/feed/@hxzhouh'])
  siteName = ''
  assert.deepEqual(JSON.parse(JSON.stringify(inspectMediumPage().feeds)), [], 'ordinary pages get no fabricated feeds')
  console.log('PASS explicit custom-domain Medium recognition and declared-feed filtering')
} catch (error) {
  console.error('FAIL Medium page:', error)
  process.exit(1)
}
