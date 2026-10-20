import { requireBookshelfPro, type BookshelfItem, type BookshelfHighlight } from './bookshelf-model'

type SearchRow = { item: BookshelfItem; fields: { text: string; lower: string; weight: number }[]; haystack: string }
export const createSearchIndex = (items: BookshelfItem[], highlights: BookshelfHighlight[]): SearchRow[] => {
  const grouped = new Map<string, string[]>()
  for (const h of highlights) {
    const parts = grouped.get(h.itemKey) || []
    parts.push(h.text, h.note || '')
    grouped.set(h.itemKey, parts)
  }
  return items.map(item => {
    const fields = [
      { text: item.title, weight: 5 }, { text: item.author, weight: 3 },
      { text: item.markdown || '', weight: 1 }, { text: (grouped.get(item.key) || []).join('\n'), weight: 2 },
    ].map(field => ({ ...field, lower: field.text.toLowerCase() }))
    return { item, fields, haystack: fields.map(f => f.lower).join('\n') }
  })
}

export const searchBookshelf = (index: SearchRow[], query: string, pro: boolean): { item: BookshelfItem; score: number; snippet: string }[] => {
  requireBookshelfPro(pro)
  const tokens = [...new Set(query.toLowerCase().trim().split(/\s+/u).filter(Boolean))]
  return index.filter(row => tokens.every(token => row.haystack.includes(token))).map(row => {
    let score = 0
    let snippet = ''
    for (const field of row.fields) {
      for (const token of tokens) {
        const at = field.lower.indexOf(token)
        if (at < 0) continue
        score += field.weight
        // Prefer body/notes snippets over a title already displayed in the result.
        if (!snippet || field.weight <= 2) {
          const start = Math.max(0, at - 55)
          snippet = (start ? '…' : '') + field.text.slice(start, at + token.length + 100).replace(/\s+/g, ' ') + (at + token.length + 100 < field.text.length ? '…' : '')
        }
      }
    }
    return { item: row.item, score, snippet }
  }).sort((a, b) => b.score - a.score || b.item.savedAt - a.item.savedAt)
}
