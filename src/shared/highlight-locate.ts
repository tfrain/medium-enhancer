// Find a saved highlight inside a paragraph's rendered text.
// The saved text is the selection with whitespace collapsed to single spaces,
// while the page keeps its own whitespace (newlines between inline elements,
// U+00A0 from Medium's editor). Match on a collapsed copy of the paragraph and
// map the hit back to offsets in the original string.
const SPACE = /[\s ]/

export const collapseSpace = (value: string): string => value.replace(/[\s ]+/g, ' ').trim()

// Every match of needle in hay, as [start, end) offsets into hay.
const matchesOf = (hay: string, needle: string): [number, number][] => {
  const wanted = collapseSpace(needle)
  if (!wanted) return []
  let flat = ''
  const origin: number[] = []
  let lastWasSpace = true // drop leading whitespace
  for (let i = 0; i < hay.length; i++) {
    if (SPACE.test(hay[i])) {
      if (lastWasSpace) continue
      flat += ' '
      origin.push(i)
      lastWasSpace = true
    } else {
      flat += hay[i]
      origin.push(i)
      lastWasSpace = false
    }
  }
  const hits: [number, number][] = []
  for (let at = flat.indexOf(wanted); at >= 0; at = flat.indexOf(wanted, at + 1)) {
    hits.push([origin[at], origin[at + wanted.length - 1] + 1])
  }
  return hits
}

// occurrence: which match to use when the same words appear more than once in
// a paragraph (0 = first). Falls back to the last match if the paragraph changed.
export const locateText = (hay: string, needle: string, occurrence = 0): [number, number] | null => {
  const hits = matchesOf(hay, needle)
  if (!hits.length) return null
  return hits[Math.min(Math.max(0, occurrence), hits.length - 1)]
}

// At capture time: the selection starts at rawStart in the paragraph's text;
// count the matches that begin before it.
export const occurrenceAt = (hay: string, needle: string, rawStart: number): number =>
  matchesOf(hay, needle).filter(([start]) => start < rawStart).length
