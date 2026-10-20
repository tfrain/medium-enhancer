// Find a saved highlight inside a paragraph's rendered text.
// The saved text is the selection with whitespace collapsed to single spaces,
// while the page keeps its own whitespace (newlines between inline elements,
// U+00A0 from Medium's editor). Match on a collapsed copy of the paragraph and
// map the hit back to offsets in the original string.
const SPACE = /[\s ]/

export const collapseSpace = (value: string): string => value.replace(/[\s ]+/g, ' ').trim()

export const locateText = (hay: string, needle: string): [number, number] | null => {
  const wanted = collapseSpace(needle)
  if (!wanted) return null
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
  const at = flat.indexOf(wanted)
  if (at < 0) return null
  return [origin[at], origin[at + wanted.length - 1] + 1]
}
