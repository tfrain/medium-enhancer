import assert from 'node:assert/strict'
import { loadSource } from './load-source.ts'

let article = true
let canonical = ''
let siteName = ''
let appLink = ''
let links: string[] = []
const document = {
  querySelector: (selector: string) => selector === 'article' ? (article ? {} : null)
    : selector === 'link[rel="canonical"]' ? { href: canonical }
    : { content: siteName },
  querySelectorAll: (selector: string) => selector.startsWith('meta') ? [{ content: appLink }]
    : links.map(href => ({ href })),
}
try {
  const { inspectMediumPage } = loadSource('src/shared/medium-page.ts', { document })
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
  siteName = 'Medium'
  article = false
  assert.equal(inspectMediumPage().isMediumStory, false, 'require story DOM as well as metadata')
  console.log('PASS explicit custom-domain Medium recognition and declared-feed filtering')
} catch (error) {
  console.error('FAIL Medium page:', error)
  process.exit(1)
}
