export type MarkdownNode = {
  tag: string
  text?: string
  attrs?: Record<string, string>
  children?: MarkdownNode[]
}

const normalizeText = (value: string): string =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
const escapeMarkdown = (value: string): string =>
  String(value || "").replace(/([\\`*_{}\[\]()#+\-.!|>])/g, "\\$1")
const textContent = (node?: MarkdownNode): string =>
  node?.tag === "BR" ? "\n" : node ? node.text ?? (node.children || []).map(textContent).join("") : ""
const findNode = (node: MarkdownNode, tag: string): MarkdownNode | undefined =>
  node.tag === tag
    ? node
    : (node.children || []).map((child) => findNode(child, tag)).find(Boolean)

// Elements Medium marks as a story's subtitle. On 2026-10-19 a live story page used
// <h2 class="pw-subtitle-paragraph">; the other two are older layouts.
export const MEDIUM_SUBTITLE_SELECTOR = '.pw-subtitle-paragraph, .graf--subtitle, [data-testid="storySubtitle"]'

export const selectSubtitle = (
  hostname: string,
  candidates: { text: string; mediumSubtitle?: boolean }[],
  title: string,
  description: string
): string => {
  return candidates
    .filter((candidate) => candidate.mediumSubtitle)
    .map((candidate) => normalizeText(candidate.text))
    .find((text) => text && text !== title && text.length <= 180) || ""
}

const linkFor = (href: string | null, sourceUrl: string): string => {
  if (!href) return ""
  try {
    return new URL(href, sourceUrl).href
  } catch {
    return href
  }
}

const inlineMarkdown = (node: MarkdownNode, sourceUrl: string): string => {
  if (node.tag === "") {
    return escapeMarkdown(node.text || "")
  }

  const element = node

  const children = Array.from(element.children || [])
    .map((child) => inlineMarkdown(child, sourceUrl))
    .join("")
  switch (element.tag) {
    case "IMG": {
      const src = linkFor(element.attrs?.src || null, sourceUrl)
      return src
        ? `![${escapeMarkdown(normalizeText(element.attrs?.alt || ""))}](${src})`
        : ""
    }
    case "UL":
    case "OL":
      return "\n" + renderMarkdownNode(element, "", sourceUrl) + "\n"
    case "P":
      return children + "\n"
    case "A": {
      const href = linkFor(element.attrs?.href || null, sourceUrl)
      const text = children || normalizeText(textContent(element) || "")
      return href && text ? `[${text}](${href})` : text
    }
    case "STRONG":
    case "B":
      return children ? `**${children}**` : ""
    case "EM":
    case "I":
      return children ? `_${children}_` : ""
    case "CODE":
      return `\`${(textContent(element) || "").replace(/`/g, "\\`")}\``
    case "BR":
      return "\n"
    default:
      return children
  }
}

export const renderMarkdownNode = (
  node: MarkdownNode,
  title = "",
  sourceUrl = "https://medium.com/"
): string => {
  if (node.tag === "") {
    return normalizeText(node.text || "")
  }

  const element = node

  const text = normalizeText(textContent(element) || "")
  switch (element.tag) {
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
      const inline = inlineMarkdown(element, sourceUrl).trim()
      return inline || ""
    }
    case "BLOCKQUOTE": {
      const quote = Array.from(element.children || [])
        .map((child) => renderMarkdownNode(child, title, sourceUrl))
        .join("\n\n")
        .trim()
      return quote
        ? quote
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n")
        : ""
    }
    case "UL":
    case "OL": {
      const ordered = element.tag === "OL"
      return Array.from(element.children || [])
        .filter((child) => child.tag === "LI")
        .map((child, index) => {
          const marker = ordered ? `${index + 1}.` : "-"
          const parts = (child.children || [])
            .map((part) => inlineMarkdown(part, sourceUrl))
            .join("")
            .trim()
            .split("\n")
          return (
            `${marker} ${parts[0]}` +
            parts
              .slice(1)
              .map((line) => `\n  ${line}`)
              .join("")
          )
        })
        .filter(Boolean)
        .join("\n")
    }
    case "PRE": {
      const code = textContent(element) || ""
      return code.trim() ? `\`\`\`\n${code.replace(/\n+$/g, "")}\n\`\`\`` : ""
    }
    case "IMG": {
      const src = linkFor(element.attrs?.src || null, sourceUrl)
      const alt = normalizeText(element.attrs?.alt || "")
      return src ? `![${alt}](${src})` : ""
    }
    case "FIGURE": {
      const image = findNode(element, "IMG")
      const caption = normalizeText(
        textContent(findNode(element, "FIGCAPTION"))
      )
      const markdown = image ? inlineMarkdown(image, sourceUrl) : ""
      return [markdown, caption ? `_${escapeMarkdown(caption)}_` : ""]
        .filter(Boolean)
        .join("\n\n")
    }
    default:
      return Array.from(element.children || [])
        .map((child) => renderMarkdownNode(child, title, sourceUrl))
        .filter((part) => part.trim())
        .join("\n\n")
  }
}
