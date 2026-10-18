type ParagraphAncestor = { id: string; parentElement: ParagraphAncestor | null }

export const findParagraphId = (start: ParagraphAncestor | null, boundary: ParagraphAncestor): string => {
  let element = start
  while (element && element !== boundary) {
    if (/^[0-9a-f]{4}$/.test(element.id)) return element.id
    element = element.parentElement
  }
  return ''
}

export const normalizeQuote = (text: string, maxChars = 600) => {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim())
  const truncated = chars.length > maxChars
  return { text: truncated ? chars.slice(0, maxChars - 1).join('').trimEnd() + '…' : chars.join(''), truncated }
}

// The caller supplies font measurement, keeping wrapping testable without Canvas.
export const layoutQuote = (
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
  maxLines = 12,
): { lines: string[]; truncated: boolean } => {
  if (maxWidth <= 0 || maxLines < 1) throw new Error('Invalid quote dimensions.')
  const normalized = normalizeQuote(text)
  const lines: string[] = []
  let line = ''
  for (const word of normalized.text.split(' ').filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word
    if (measure(candidate) <= maxWidth) { line = candidate; continue }
    if (line) { lines.push(line); line = '' }
    // Split long URLs and text without spaces, including CJK, at code points.
    for (const char of word) {
      if (line && measure(line + char) > maxWidth) { lines.push(line); line = '' }
      line += char
    }
  }
  if (line) lines.push(line)
  const truncated = normalized.truncated || lines.length > maxLines
  if (lines.length > maxLines) {
    lines.length = maxLines
    const chars = Array.from(lines[maxLines - 1])
    while (chars.length && measure(chars.join('').trimEnd() + '…') > maxWidth) chars.pop()
    lines[maxLines - 1] = chars.join('').trimEnd() + '…'
  }
  return { lines, truncated }
}

export const quoteCardBranding = (pro: boolean) => ({ watermark: !pro, attribution: true as const })

export const QUOTE_TEMPLATES = [
  { id: 'classic', label: 'Classic', pro: false },
  { id: 'dark', label: 'Dark', pro: true },
  { id: 'gradient', label: 'Gradient', pro: true },
  { id: 'minimal', label: 'Minimal', pro: true },
] as const

export const QUOTE_SIZES = [
  { id: 'landscape', label: 'Landscape 1200×675', width: 1200, height: 675, pro: false },
  { id: 'square', label: 'Square 1080×1080', width: 1080, height: 1080, pro: true },
  { id: 'portrait', label: 'Portrait 1080×1350', width: 1080, height: 1350, pro: true },
] as const

export type QuoteTemplate = typeof QUOTE_TEMPLATES[number]['id']
export type QuoteSize = typeof QUOTE_SIZES[number]['id']
export type QuoteCard = {
  quote: string
  truncated: boolean
  author: string
  title: string
  publication: string
  link: string
}

export const renderQuoteCard = (
  canvas: HTMLCanvasElement,
  card: QuoteCard,
  template: QuoteTemplate,
  size: QuoteSize,
  pro: boolean,
): { truncated: boolean } => {
  const dimensions = QUOTE_SIZES.find(item => item.id === size) || QUOTE_SIZES[0]
  canvas.width = dimensions.width
  canvas.height = dimensions.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable.')
  const { width, height } = canvas
  const padding = 80
  const maxWidth = width - padding * 2
  const dark = template === 'dark' || template === 'gradient'
  ctx.fillStyle = dark ? '#15201d' : template === 'minimal' ? '#ffffff' : '#faf6ee'
  if (template === 'gradient') {
    const gradient = ctx.createLinearGradient(0, 0, width, height)
    gradient.addColorStop(0, '#193a53')
    gradient.addColorStop(1, '#4a2859')
    ctx.fillStyle = gradient
  }
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = dark ? '#67d9b0' : '#1a8917'
  ctx.fillRect(padding, 56, template === 'minimal' ? 48 : 88, 5)
  ctx.fillStyle = dark ? '#f6f4ef' : '#1b2420'
  ctx.textBaseline = 'top'
  const measure = (text: string) => ctx.measureText(text).width
  const quoteTop = 100
  const attributionTop = height - 184
  const quoteHeight = attributionTop - quoteTop - 36
  const family = template === 'minimal' || template === 'gradient' ? 'Arial, sans-serif' : 'Georgia, serif'
  // Taller cards start larger; the loop below shrinks the font until the quote fits.
  let fontSize = size === 'landscape' ? 44 : size === 'square' ? 60 : 64
  let layout: ReturnType<typeof layoutQuote>
  let lineHeight: number
  do {
    ctx.font = `${fontSize}px ${family}`
    lineHeight = Math.ceil(fontSize * 1.3)
    layout = layoutQuote(card.quote, maxWidth, measure, Math.floor(quoteHeight / lineHeight))
    if (!layout.truncated || fontSize <= 26) break
    fontSize -= 2
  } while (true)
  // Centre the quote in the space above the attribution, so short quotes on the
  // square and portrait sizes do not leave a gap under the text.
  const quoteOffset = quoteTop + Math.max(0, Math.floor((quoteHeight - layout.lines.length * lineHeight) / 2))
  layout.lines.forEach((line, index) => ctx.fillText(line, padding, quoteOffset + index * lineHeight))

  // Attribution is mandatory in every template, including Pro exports.
  ctx.font = 'bold 22px Arial, sans-serif'
  layoutQuote(card.author || 'Unknown author', maxWidth, measure, 1).lines.forEach(line => ctx.fillText(line, padding, attributionTop))
  ctx.font = '20px Arial, sans-serif'
  layoutQuote(card.title || 'Untitled story', maxWidth, measure, 2).lines.forEach((line, index) => ctx.fillText(line, padding, attributionTop + 34 + index * 26))
  ctx.font = '18px Arial, sans-serif'
  const suffix = ' · medium.com'
  const publication = layoutQuote(card.publication, maxWidth - measure(suffix), measure, 1).lines[0]
  ctx.fillText(publication ? publication + suffix : 'medium.com', padding, attributionTop + 98)
  if (quoteCardBranding(pro).watermark) {
    ctx.font = '16px Arial, sans-serif'
    ctx.fillStyle = dark ? '#b3c5be' : '#65706a'
    const watermark = 'Made with Medium Enhancer'
    ctx.fillText(watermark, width - padding - measure(watermark), height - 38)
  }
  return { truncated: card.truncated || layout.truncated }
}
