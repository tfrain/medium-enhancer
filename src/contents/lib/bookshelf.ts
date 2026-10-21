import { bookshelfRequest } from '../../shared/bookshelf-client'
import { mediumPostId } from '../../shared/medium-url'
import { findParagraphId } from '../../shared/quote-card'
import { occurrenceAt } from '../../shared/highlight-locate'
import { MEDIUM_SUBTITLE_SELECTOR } from '../../shared/markdown-content'
import { clipCurrentMediumArticleAsMarkdown } from '../markdown/medium-to-markdown'
import { readQuoteCard, quoteStoryRoot } from './quote-card'

const textOf = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() || ''
const meta = (name: string) => document.querySelector<HTMLMetaElement>(`meta[name="${name}"], meta[property="${name}"]`)?.content?.trim() || ''
export const readBookshelfMetadata = () => {
  const url = window.location.href
  const article = document.querySelector('article')
  if (!mediumPostId(url) || !article) throw new Error('Open a supported Medium story first.')
  return {
    url,
    canonicalUrl: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href,
    title: textOf(article.querySelector('h1')) || meta('og:title') || document.title,
    author: meta('author') || textOf(article.querySelector('[data-testid="authorName"], .pw-author, a[rel="author"]')),
    publication: textOf(document.querySelector('[data-testid="publicationName"], [data-testid="storyPublicationName"], .pw-publication-name, a[href*="publication_info"], a[href*="publication_nav"]')) || (meta('og:site_name').toLowerCase() !== 'medium' ? meta('og:site_name') : ''),
    subtitle: textOf(article.querySelector(MEDIUM_SUBTITLE_SELECTOR)),
  }
}
export const saveCurrentStory = async (archiveOnly = false, expectedKey?: string) => {
  const metadata = readBookshelfMetadata()
  if (expectedKey && mediumPostId(metadata.url) !== expectedKey) throw new Error('The story in this tab changed. Open the saved story and try again.')
  const status = await bookshelfRequest({ action: 'status' })
  if (!status.enabled) throw new Error('Bookshelf is disabled in Options.')
  if (archiveOnly && !status.pro) throw new Error('Pro is required to archive.')
  if (archiveOnly && !status.saved) throw new Error('Save this story first.')
  let markdown: string | undefined
  let warning: string | undefined
  if (status.pro) {
    try { markdown = clipCurrentMediumArticleAsMarkdown().markdown }
    catch (error) {
      if (archiveOnly) throw error
      warning = (error as Error).message
    }
  }
  // The service rechecks entitlement and the actual sender's story before writing.
  const response = await bookshelfRequest({ action: 'save', metadata, markdown, archiveOnly })
  return { ...response, warning }
}
export const highlightCurrentStory = async (selectionText = '') => {
  const url = window.location.href
  const checkUrl = () => {
    if (window.location.href !== url) throw new Error('The story in this tab changed. Select the text again.')
  }
  const selection = window.getSelection()
  const article = quoteStoryRoot()
  // Reuse the quote-card selection boundary checks, including intersected noise.
  if (!article || !selection?.rangeCount || selection.isCollapsed || !readQuoteCard()) throw new Error('Select text inside the story first.')
  const text = selection.toString().replace(/\s+/g, ' ').trim()
  if (selectionText && selectionText.replace(/\s+/g, ' ').trim() !== text) throw new Error('Selection changed. Select the text again.')
  const range = selection.getRangeAt(0)
  const start = range.startContainer
  const element = start.nodeType === Node.ELEMENT_NODE ? start as Element : start.parentElement
  // Which copy of these words was selected, if the paragraph repeats them.
  let occurrence = 0
  const block = element?.closest('p, li, blockquote, h2, h3, h4, figcaption')
  if (block && article.contains(block)) {
    const before = document.createRange()
    before.setStart(block, 0)
    before.setEnd(range.startContainer, range.startOffset)
    occurrence = occurrenceAt(block.textContent || '', text, before.toString().length)
  }
  // Highlighting an unsaved story saves it first (and archives it for Pro).
  const status = await bookshelfRequest({ action: 'status' })
  checkUrl()
  if (!status.saved) {
    await saveCurrentStory()
    checkUrl()
  }
  // Saved under the pinned url, so navigating away after this point is harmless.
  return bookshelfRequest({ action: 'highlight', url, text, paragraphId: findParagraphId(element, article), occurrence })
}
