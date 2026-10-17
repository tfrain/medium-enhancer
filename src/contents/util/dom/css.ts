export const addCSS = function(css: string, id: string): () => void {
  let style = document.getElementById(id) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.type = 'text/css'
    style.id = id
    style.textContent = css
    document.head.appendChild(style)
  }
  return () => style!.remove()
}
