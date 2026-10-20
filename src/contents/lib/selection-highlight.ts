import { bookshelfRequest } from '../../shared/bookshelf-client'
import { showToast } from '../util/toast'
import { highlightCurrentStory } from './bookshelf'
import { applyInPageHighlights, highlightIdsIn } from './inpage-highlights'

export type HighlightMode = 'add' | 'remove' | 'pro' | 'off'

// Bookshelf status for this story, cached so the selection toolbar can decide
// synchronously. Refreshed per page, on relevant setting changes, after actions.
let status = { known: false, enabled: false, pro: false }
export const refreshHighlightStatus = async () => {
  try {
    const result = await bookshelfRequest({ action: 'status' })
    status = { known: true, enabled: !!result.enabled, pro: !!result.pro }
  } catch { status = { known: false, enabled: false, pro: false } } // not a story page
}

export const highlightModeFor = (range: Range): HighlightMode => {
  if (!status.known || !status.enabled) return 'off'
  if (highlightIdsIn(range).length) return 'remove'
  return status.pro ? 'add' : 'pro'
}

export const runHighlight = async (mode: HighlightMode, range: Range, selectionText: string) => {
  try {
    if (mode === 'pro') {
      showToast('Highlights are part of Pro. Unlock it in the extension Options → Pro.')
      return
    }
    if (mode === 'remove') {
      const ids = highlightIdsIn(range)
      await bookshelfRequest({ action: 'unhighlight', url: window.location.href, ids })
      window.getSelection()?.removeAllRanges()
      await applyInPageHighlights()
      showToast(ids.length > 1 ? 'Highlights removed.' : 'Highlight removed.')
      return
    }
    if (mode === 'add') {
      await highlightCurrentStory(selectionText)
      window.getSelection()?.removeAllRanges()
      await applyInPageHighlights()
      showToast('Highlighted. Find it on your Bookshelf.')
    }
  } catch (error) {
    showToast((error as Error).message || 'Could not update the highlight.')
  } finally {
    void refreshHighlightStatus()
  }
}
