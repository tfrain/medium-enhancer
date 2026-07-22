export const canScroll = (el: HTMLElement) => {
  return (
    ['auto', 'scroll'].includes(window.getComputedStyle(el)!.overflowY!) &&
    el.clientHeight + 1 < el.scrollHeight
  )
}
