import { requireBookshelfPro, type BookshelfItem, type BookshelfHighlight } from './bookshelf-model'
import { buildParagraphLink } from './medium-url'

// JSON strings are YAML double-quoted scalars, including quotes, colons and newlines.
export const exportMarkdown = (item: BookshelfItem, highlights: BookshelfHighlight[], pro: boolean): string => {
  requireBookshelfPro(pro)
  const frontmatter = ['---', ...['title', 'author', 'publication', 'url'].map(key => `${key}: ${JSON.stringify(item[key])}`),
    `savedAt: ${JSON.stringify(new Date(item.savedAt).toISOString())}`, `tags: ${JSON.stringify(item.tags)}`, '---'].join('\n')
  const quotes = highlights.filter(h => h.itemKey === item.key).map(h => {
    const lines = [`- ${h.text}`, `  Source: ${buildParagraphLink(item.url, h.paragraphId)}`, ...(h.note ? [`  Note: ${h.note}`] : [])]
    return lines.join('\n').split('\n').map(line => `> ${line}`).join('\n')
  }).join('\n>\n')
  const body = item.markdown?.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n)?/, '').trim()
  return [frontmatter, quotes, body || `# ${item.title}\n\n${item.subtitle}`].filter(Boolean).join('\n\n') + '\n'
}

const truncateUtf8 = (value: string, budget: number): string => {
  let result = ''
  let bytes = 0
  for (const character of value) {
    const code = character.codePointAt(0)!
    const size = code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4
    if (bytes + size > budget) break
    result += character
    bytes += size
  }
  return result
}
const filenameStem = (title: string): string => {
  let stem = truncateUtf8(title.normalize('NFKC').replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, ''), 200).replace(/[. ]+$/g, '') || 'Untitled'
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = '_' + stem
  return stem
}
export const exportFiles = (items: BookshelfItem[], highlights: BookshelfHighlight[], pro: boolean): { name: string; content: string }[] => {
  requireBookshelfPro(pro)
  const used = new Set<string>()
  const grouped = new Map<string, BookshelfHighlight[]>()
  for (const h of highlights) grouped.set(h.itemKey, [...(grouped.get(h.itemKey) || []), h])
  return items.map(item => {
    const stem = filenameStem(item.title)
    let name = `${stem}.md`
    let count = 2
    while (used.has(name.toLowerCase())) name = `${stem} (${count++}).md`
    used.add(name.toLowerCase())
    return { name, content: exportMarkdown(item, grouped.get(item.key) || [], pro) }
  })
}
