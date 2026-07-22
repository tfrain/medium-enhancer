import { isDebugging } from '../util/env'
import { draw } from '../util/debug'
import { toArray } from '../util/dom/to_array'
import { canScroll } from './scroll'

const getAncestors = function (elem: HTMLElement, maxDepth = -1): HTMLElement[] {
  const ancestors: HTMLElement[] = []
  let cur: HTMLElement | null = elem
  while (cur && maxDepth--) {
    ancestors.push(cur)
    cur = cur.parentElement
  }
  return ancestors
}

const ARTICLE_TAG_WEIGHTS: { [Selector: string]: number[] } = {
  h1: [0, 100, 60, 40, 30, 25, 22, 18].map((s) => s * 0.4),
  h2: [0, 100, 60, 40, 30, 25, 22, 18],
  h3: [0, 100, 60, 40, 30, 25, 22, 18].map((s) => s * 0.5),
  h4: [0, 100, 60, 40, 30, 25, 22, 18].map((s) => s * 0.5 * 0.5),
  h5: [0, 100, 60, 40, 30, 25, 22, 18].map((s) => s * 0.5 * 0.5 * 0.5),
  h6: [0, 100, 60, 40, 30, 25, 22, 18].map((s) => s * 0.5 * 0.5 * 0.5 * 0.5),
  strong: [0, 100, 60, 40, 30, 25, 22, 18].map((s) => s * 0.5 * 0.5 * 0.5),
  article: [500],
  '.article': [500],
  '#article': [500],
  '.content': [101],
  sidebar: [-500, -100, -50],
  '.sidebar': [-500, -100, -50],
  '#sidebar': [-500, -100, -50],
  aside: [-500, -100, -50],
  '.aside': [-500, -100, -50],
  '#aside': [-500, -100, -50],
  nav: [-500, -100, -50],
  '.nav': [-500, -100, -50],
  '.navigation': [-500, -100, -50],
  '.toc': [-500, -100, -50],
  '.table-of-contents': [-500, -100, -50],
  '.comment': [-500, -100, -50],
}

const getElemsCommonLeft = (elems: HTMLElement[]): number | undefined => {
  if (!elems.length) {
    return undefined
  }
  const lefts: { [Left: number]: number } = {}
  elems.forEach((el) => {
    const left = el.getBoundingClientRect().left
    if (!lefts[left]) {
      lefts[left] = 0
    }
    lefts[left]++
  })
  const count = elems.length

  const isAligned = Object.keys(lefts).length <= Math.ceil(0.3 * count)
  if (!isAligned) {
    return undefined
  }
  const sortedByCount = Object.keys(lefts).sort((a, b) => lefts[b] - lefts[a])
  const most = Number(sortedByCount[0])
  return most
}

export const extractArticle = function (): HTMLElement | undefined {
  const elemScores = new Map<HTMLElement, number>()

  // weigh nodes by factor: "selector" "distance from this node"
  Object.keys(ARTICLE_TAG_WEIGHTS).forEach((selector) => {
    let elems = toArray(document.querySelectorAll(selector)) as HTMLElement[]
    if (selector.toLowerCase() === 'strong') {
      // for <strong> elements, only take them as heading when they align at left
      const commonLeft = getElemsCommonLeft(elems)
      if (commonLeft === undefined || commonLeft > window.innerWidth / 2) {
        elems = []
      } else {
        elems = elems.filter(
          (elem) => elem.getBoundingClientRect().left === commonLeft,
        )
      }
    }
    elems.forEach((elem) => {
      const weights = ARTICLE_TAG_WEIGHTS[selector]
      const ancestors = getAncestors(elem as HTMLElement, weights.length)
      ancestors.forEach((elem, distance) => {
        elemScores.set(
          elem,
          (elemScores.get(elem) || 0) + weights[distance] || 0,
        )
      })
    })
  })
  const sortedByScore = [...elemScores].sort((a, b) => b[1] - a[1])

  // pick top 5 node to re-weigh
  const candicates = sortedByScore
    .slice(0, 5)
    .filter(Boolean)
    .map(([elem, score]) => {
      return { elem, score }
    })

  // re-weigh by factor:  "take-lots-vertical-space", "contain-less-links", "not-too-narrow", "cannot-scroll"
  const isTooNarrow = (e: HTMLElement) => e.scrollWidth < 400 // rule out sidebars
  candicates.forEach((candicate) => {
    if (isTooNarrow(candicate.elem)) {
      candicate.score = 0
      candicates.forEach((parent) => {
        if (parent.elem.contains(candicate.elem)) {
          parent.score *= 0.7
        }
      })
    }
    if (canScroll(candicate.elem) && candicate.elem !== document.body) {
      candicate.score *= 0.5
    }
  })

  const reweighted = candicates
    .map(({ elem, score }) => {
      return {
        elem,
        score:
          score *
          Math.log(
            (elem.scrollHeight * elem.scrollHeight) /
            (elem.querySelectorAll('a').length || 1),
          ),
      }
    })
    .sort((a, b) => b.score - a.score)

  if (isDebugging) {
    console.log('[extract]', {
      elemScores,
      sortedByScore,
      candicates,
      reweighted,
    })
  }
  let article: HTMLElement | undefined = reweighted.length ? reweighted[0].elem : undefined

  const dm = document.domain;
  const isInoReader = dm.indexOf('inoreader.com') >= 0 || dm.indexOf('innoreader.com') > 0;
  const container = document.getElementById("root") as HTMLElement | null;

  let selectorInoreader = '.article_content'
  let selectorMedium = 'article'
  let mediumArticle = container != null && document.querySelector(selectorMedium) as HTMLElement || null


  chrome.storage.local.get({
    selectorInoreader: '.article_content',
    selectorMedium: 'article'
  }, function (items) {
    selectorInoreader = items.selectorInoreader
    selectorMedium = items.selectorMedium
  });

  if (isInoReader || mediumArticle != null) {
    const articleClass = mediumArticle != null ? selectorMedium : selectorInoreader;
    const content = document.querySelector(articleClass)
    if (content != null) {
      article = content as HTMLElement
    }
    else {
      article = undefined
    }
  }

  if (isDebugging) {
    draw(article, 'red')
  }
  return article
}

const AI_NOISE_SELECTORS = [
  'footer',
  'aside',
  'nav',
  'form',
  'button',
  'textarea',
  'input',
  '[role="dialog"]',
  '[aria-label*="comment" i]',
  '[aria-label*="response" i]',
  '[data-testid*="comment" i]',
  '[data-testid*="response" i]',
  '[id*="comment" i]',
  '[class*="comment" i]',
  '[class*="response" i]',
  '[class*="reply" i]',
  '#__me_summary_ball__',
  '#__me_ai_menu__',
  '#__me_summary_panel__',
].join(', ')

export const extractArticleTextForAI = (articleDom: HTMLElement | undefined): string => {
  if (!articleDom) return ''
  const cloned = articleDom.cloneNode(true) as HTMLElement
  try {
    cloned.querySelectorAll(AI_NOISE_SELECTORS).forEach((node) => node.remove())
  } catch {}
  return (cloned.innerText || '').trim()
}

