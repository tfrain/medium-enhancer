import assert from "node:assert/strict"

try {
  const { renderMarkdownNode } = await import(
    "../src/shared/markdown-content.ts"
  )
  const text = (text: string) => ({ tag: "", text })
  const node = (tag: string, children: any[] = [], attrs = {}) => ({
    tag,
    children,
    attrs
  })
  assert.equal(renderMarkdownNode(node("PRE", [text("first()"), node("BR"), node("CODE", [text("second()")])])), "```\nfirst()\nsecond()\n```", "code BR nodes preserve line breaks")
  const image = node("IMG", [], { src: "/img.png", alt: "an image" })
  assert.equal(
    renderMarkdownNode(
      node("P", [text("before "), image, text(" after")]),
      "",
      "https://example.com/post"
    ),
    "before ![an image](https://example.com/img.png) after"
  )
  const list = node("UL", [
    node("LI", [
      text("parent"),
      node("OL", [
        node("LI", [image]),
        node("LI", [text("child"), node("UL", [node("LI", [text("deep")])])])
      ])
    ]),
    node("LI", [text("next")])
  ])
  assert.equal(
    renderMarkdownNode(list, "", "https://example.com/post"),
    "- parent\n  1. ![an image](https://example.com/img.png)\n  2. child\n    - deep\n- next"
  )
  assert.equal(
    renderMarkdownNode(
      node("UL", [
        node("LI", [node("P", [text("first")]), node("P", [text("second")])])
      ])
    ),
    "- first\n  second"
  )
  const wrappedList = node("UL", [
    node("LI", [
      node("DIV", [text("Parent"), node("OL", [node("LI", [text("Child")])])])
    ])
  ])
  assert.equal(renderMarkdownNode(wrappedList), "- Parent\n  1. Child")
  console.log(
    "PASS Markdown inline images and recursively indented mixed lists"
  )
} catch (error) {
  console.error("FAIL Markdown conversion:", error)
  process.exit(1)
}
