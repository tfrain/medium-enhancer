import { inspectMediumPage } from "../../shared/medium-page"
import { MEDIUM_SUBTITLE_SELECTOR, renderMarkdownNode, selectSubtitle, type MarkdownNode } from "../../shared/markdown-content"
import { extractArticle } from "../lib/extract"

export type MediumMarkdownClip = {
  title: string
  markdown: string
  sourceUrl: string
  author: string
  published: string
  domain: string
}

const escapeYaml = (value: string): string =>
  `"${String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`

const sanitizeFilename = (value: string): string =>
  String(value || "Untitled")
    .replace(/[/?<>\\:*|":]/g, "")
    .replace(/\s+/g, " ")
    .trim() || "Untitled"

const normalizeText = (value: string): string =>
  String(value || "").replace(/\s+/g, " ").trim()

const getMetaContent = (...selectors: string[]): string => {
  for (const selector of selectors) {
    const value = document.querySelector<HTMLMetaElement>(selector)?.content?.trim()
    if (value) return value
  }
  return ""
}

const getArticleTitle = (article: HTMLElement): string => {
  const title =
    normalizeText(article.querySelector("h1")?.textContent || "") ||
    getMetaContent('meta[property="og:title"]', 'meta[name="twitter:title"]') ||
    normalizeText(document.title.replace(/\s*\|\s*Medium\s*$/i, ""))
  return title || "Untitled"
}

const getArticleSubtitle = (article: HTMLElement, title: string): string => {
  const candidates = Array.from(article.querySelectorAll(`h2, p, ${MEDIUM_SUBTITLE_SELECTOR}`))
    .map(node => ({
      text: node.textContent || '',
      mediumSubtitle: node.matches(MEDIUM_SUBTITLE_SELECTOR),
    }))
  return selectSubtitle(window.location.hostname, candidates, title, getMetaContent('meta[name="description"]'))
}

const isNoise = (element: Element): boolean =>
  Boolean(element.closest([
    "button",
    "nav",
    "aside",
    "footer",
    "header",
    "form",
    "script",
    "style",
    "noscript",
    "svg",
    "iframe",
    "[role='dialog']",
    "[aria-hidden='true']",
    "[aria-label*='response' i]",
    "[aria-label*='comment' i]",
    "#__me_summary_ball__",
    "#__me_ai_menu__",
    "#__me_summary_panel__",
  ].join(",")))

// Keep DOM access here; the serializer receives only a plain content tree.
const markdownNodeFrom = (node: Node): MarkdownNode => {
  if (node.nodeType === Node.TEXT_NODE) return { tag: '', text: node.textContent || '' }
  if (node.nodeType !== Node.ELEMENT_NODE || isNoise(node as Element)) return { tag: '', text: '' }
  const element = node as HTMLElement
  return {
    tag: element.tagName,
    attrs: Object.fromEntries(['src', 'href', 'alt'].map(name => [name, element.getAttribute(name) || ''])),
    children: Array.from(element.childNodes).map(markdownNodeFrom),
  }
}

const buildFrontmatter = (
  title: string,
  subtitle: string,
  sourceUrl: string,
  author: string,
  published: string,
): string => {
  const rows = [
    "---",
    `title: ${escapeYaml(title)}`,
    subtitle ? `subtitle: ${escapeYaml(subtitle)}` : "",
    author ? `author: ${escapeYaml(author)}` : "",
    published ? `published: ${escapeYaml(published)}` : "",
    `source: ${escapeYaml(sourceUrl)}`,
    "---",
  ].filter(Boolean)

  return rows.join("\n")
}

const getReadableScore = (element: HTMLElement): number => {
  const text = normalizeText(element.innerText || element.textContent || "")
  if (text.length < 200) return 0

  const linksText = Array.from(element.querySelectorAll("a"))
    .map((link) => normalizeText(link.textContent || ""))
    .join(" ")
  const linkDensity = linksText.length / Math.max(text.length, 1)
  const paragraphCount = element.querySelectorAll("p").length
  const headingCount = element.querySelectorAll("h1,h2,h3").length
  const width = element.getBoundingClientRect().width || element.scrollWidth

  if (linkDensity > 0.55) return 0
  if (width > 0 && width < 320) return 0

  return text.length + paragraphCount * 500 + headingCount * 200 - linkDensity * 2000
}

const findFallbackArticleRoot = (): HTMLElement | undefined => {
  const selectors = [
    "article",
    "main",
    "[role='main']",
    ".post",
    ".entry",
    ".entry-content",
    ".post-content",
    ".article-content",
    ".content",
    "#content",
  ]
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(selectors.join(",")))
    .filter((element) => !isNoise(element))

  if (document.body) {
    candidates.push(document.body)
  }

  return candidates
    .map((element) => ({ element, score: getReadableScore(element) }))
    .sort((a, b) => b.score - a.score)[0]?.element
}

const bodyMarkdownFrom = (root: HTMLElement, title: string): string => {
  const markdown = Array.from(root.children)
    .map((child) => renderMarkdownNode(markdownNodeFrom(child), title, window.location.href))
    .filter((part) => part.trim())
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  if (markdown) return markdown

  return normalizeText(root.innerText || root.textContent || "")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n")
}

export const clipCurrentMediumArticleAsMarkdown = (): MediumMarkdownClip => {
  const mediumArticle = inspectMediumPage().isMediumStory ? document.querySelector<HTMLElement>('article') : null
  const article = mediumArticle || extractArticle() || findFallbackArticleRoot()
  if (!article) {
    throw new Error("No article-like content found on this page.")
  }

  const cloned = article.cloneNode(true) as HTMLElement
  const title = getArticleTitle(cloned)
  const subtitle = getArticleSubtitle(cloned, title)
  const sourceUrl = window.location.href
  const author = getMetaContent('meta[name="author"]')
  const published =
    document.querySelector<HTMLTimeElement>("time[datetime]")?.dateTime ||
    getMetaContent('meta[property="article:published_time"]')
  const domain = window.location.hostname.replace(/^www\./i, "")

  cloned.querySelector("h1")?.remove()
  if (subtitle) {
    const subtitleNode = Array.from(cloned.querySelectorAll(`h2, p, ${MEDIUM_SUBTITLE_SELECTOR}`))
      .find((node) => normalizeText(node.textContent || "") === subtitle)
    subtitleNode?.remove()
  }

  const body = bodyMarkdownFrom(cloned, title)

  if (!body || body.length < 80) {
    throw new Error("Could not extract enough readable content from this page.")
  }

  const markdown = [
    buildFrontmatter(title, subtitle, sourceUrl, author, published),
    "",
    `# ${title}`,
    subtitle ? `\n## ${subtitle}` : "",
    "",
    body,
  ].filter((part) => part !== "").join("\n")

  return {
    title: sanitizeFilename(title),
    markdown,
    sourceUrl,
    author: sanitizeFilename(author),
    published,
    domain: sanitizeFilename(domain),
  }
}
