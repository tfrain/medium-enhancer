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

const escapeMarkdown = (value: string): string =>
  String(value || "").replace(/([\\`*_{}\[\]()#+\-.!|>])/g, "\\$1")

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
  const candidates = Array.from(article.querySelectorAll("h2, p"))
    .slice(0, 8)
    .map((node) => normalizeText(node.textContent || ""))
    .filter((text) => text && text !== title && text.length <= 180)
  return candidates[0] || getMetaContent('meta[name="description"]')
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

const linkFor = (href: string | null): string => {
  if (!href) return ""
  try {
    return new URL(href, window.location.href).href
  } catch {
    return href
  }
}

const inlineMarkdown = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeMarkdown(node.textContent || "")
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ""

  const element = node as HTMLElement
  if (isNoise(element)) return ""

  const children = Array.from(element.childNodes).map(inlineMarkdown).join("")
  switch (element.tagName) {
    case "A": {
      const href = linkFor(element.getAttribute("href"))
      const text = children || normalizeText(element.textContent || "")
      return href && text ? `[${text}](${href})` : text
    }
    case "STRONG":
    case "B":
      return children ? `**${children}**` : ""
    case "EM":
    case "I":
      return children ? `_${children}_` : ""
    case "CODE":
      return `\`${(element.textContent || "").replace(/`/g, "\\`")}\``
    case "BR":
      return "\n"
    default:
      return children
  }
}

const blockMarkdown = (node: Node, title: string): string => {
  if (node.nodeType === Node.TEXT_NODE) {
    return normalizeText(node.textContent || "")
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ""

  const element = node as HTMLElement
  if (isNoise(element)) return ""

  const text = normalizeText(element.textContent || "")
  switch (element.tagName) {
    case "H1":
      return text && text !== title ? `# ${text}` : ""
    case "H2":
      return text ? `## ${text}` : ""
    case "H3":
      return text ? `### ${text}` : ""
    case "H4":
    case "H5":
    case "H6":
      return text ? `#### ${text}` : ""
    case "P": {
      const inline = inlineMarkdown(element).trim()
      return inline || ""
    }
    case "BLOCKQUOTE": {
      const quote = Array.from(element.childNodes)
        .map((child) => blockMarkdown(child, title))
        .join("\n\n")
        .trim()
      return quote
        ? quote.split("\n").map((line) => `> ${line}`).join("\n")
        : ""
    }
    case "UL":
    case "OL": {
      const ordered = element.tagName === "OL"
      return Array.from(element.children)
        .filter((child) => child.tagName === "LI")
        .map((child, index) => {
          const marker = ordered ? `${index + 1}.` : "-"
          return `${marker} ${inlineMarkdown(child).trim()}`
        })
        .filter(Boolean)
        .join("\n")
    }
    case "PRE": {
      const code = element.textContent || ""
      return code.trim() ? `\`\`\`\n${code.replace(/\n+$/g, "")}\n\`\`\`` : ""
    }
    case "IMG": {
      const src = linkFor(element.getAttribute("src"))
      const alt = normalizeText(element.getAttribute("alt") || "")
      return src ? `![${alt}](${src})` : ""
    }
    case "FIGURE": {
      const image = element.querySelector("img")
      const src = image ? linkFor(image.getAttribute("src")) : ""
      const alt = normalizeText(image?.getAttribute("alt") || "")
      const caption = normalizeText(element.querySelector("figcaption")?.textContent || "")
      if (!src) return caption
      return caption ? `![${alt}](${src})\n\n_${escapeMarkdown(caption)}_` : `![${alt}](${src})`
    }
    default:
      return Array.from(element.childNodes)
        .map((child) => blockMarkdown(child, title))
        .filter((part) => part.trim())
        .join("\n\n")
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
    .map((child) => blockMarkdown(child, title))
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
  const article = extractArticle() || findFallbackArticleRoot()
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
    const subtitleNode = Array.from(cloned.querySelectorAll("h2, p"))
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
