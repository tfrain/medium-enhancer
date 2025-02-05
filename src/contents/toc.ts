import { extractHeadings } from './lib/extract'
import { enterReadableMode, leaveReadableMode } from './lib/readable'
import { getScrollElement, getScrollTop, smoothScroll } from './lib/scroll'
import { type Article, type Content, type Heading, type Scroller } from './types'
import { ui } from './ui/index'
import { createEventEmitter } from './util/event'
import { Stream } from './util/stream'
import { isDebugging, offsetKey } from './util/env'
import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: [
    "http://*/*",
    "https://*/*"
  ],
  run_at: "document_end",
}

export interface TocPreference {
  offset: {
    x: number
    y: number
  }
}

export interface TocEvents {
  error: {
    reason: string
  }
}

// 计算当前激活的标题：这个函数通过监听滚动事件和内容变化，计算当前激活的标题索引。
// 参数：
//   scroller - 作为文章滚动容器的 HTML 元素。它可以是文档主体（document body）或具有滚动条的特定容器元素。
//   $isShown - 这是一个流，发出布尔值，指示目录（TOC）当前是否显示。它有助于根据 TOC 的可见性来确定是否执行某些操作。
//   $content - 这是一个流，发出 Content 对象。Content 对象包含关于文章、滚动容器和标题的信息。它用于获取内容的当前状态并计算激活的标题。
//   $topbarHeight - 这是一个流，发出顶部栏的高度。顶部栏高度用于计算滚动容器的可见区域，并确定当前可见的标题。
//   addDisposer - 是一个函数，接受一个取消订阅函数（unsub）作为参数，并将其添加到清理器列表中。清理器用于在不再需要时清理事件监听器和其他资源。该函数返回清理器的唯一标识符。
function activeHeadingStream({
  scroller,
  $isShown,
  $content,
  $topbarHeight,
  addDisposer,
}: {
  scroller: HTMLElement
  $isShown: Stream<boolean>
  $content: Stream<Content>
  $topbarHeight: Stream<number>
  addDisposer: (unsub: () => void) => number
}) {
  // 计算当前激活的标题索引
  const calcActiveHeading = ({
    article,
    scroller,
    headings,
    topbarHeight,
  }: {
    article: Article
    scroller: Scroller
    headings: Heading[]
    topbarHeight: number
  }): number => {
    const visibleAreaHeight = Math.max(topbarHeight, scroller.rect.top)
    const scrollY = getScrollTop(scroller.dom)

    let i = 0
    for (; i < headings.length; i++) {
      const heading = headings[i]
      const headingRectTop =
        scroller.rect.top -
        scrollY +
        article.fromScrollerTop +
        heading.fromArticleTop!
      const isCompletelyVisible = headingRectTop >= visibleAreaHeight + 15
      if (isCompletelyVisible) {
        break
      }
    }
    // 当前激活的标题索引是 'nearly-visible' 标题 (headings[i-1])
    const curIndex = Math.max(0, i - 1)
    return curIndex
  }

  // 创建一个流来监听滚动事件
  //   Stream.fromEvent 是一个静态方法，用于从事件创建一个流。它监听指定元素上的事件，并将事件转换为流。
  // 参数：
  // scroller === document.body ? window : scroller：如果 scroller 是 document.body，则监听 window 上的滚动事件；否则，监听 scroller 元素上的滚动事件。
  // 'scroll'：要监听的事件类型，这里是滚动事件。
  // addDisposer：一个函数，用于添加清理器。当不再需要监听事件时，可以调用清理器来移除事件监听器。
  const $scroll = Stream.fromEvent(
    scroller === document.body ? window : scroller,
    'scroll',
    addDisposer,
  )
    .map(() => null) // 这里的 map 操作符将每个滚动事件映射为 null，即忽略事件的具体内容，只关心事件的发生。
    .startsWith(null) // 这里的 startsWith(null) 表示在流开始时先发出一个 null 值。
    .log('scroll') // 里的 log('scroll') 表示在每次滚动事件发生时记录日志，日志内容为 'scroll'。

  // 创建一个流来计算当前激活的标题索引
  //   是一个静态方法，用于组合多个流。它会等待所有输入流都发出至少一个值，然后将这些值组合成一个数组，并发出这个数组。
  // 参数：
  // $content：内容流，发出 Content 对象。
  // $topbarHeight：顶部栏高度流，发出顶部栏的高度。
  // $scroll：滚动事件流，发出滚动事件。
  // $isShown：目录是否显示的流，发出布尔值。
  const $activeHeading: Stream<number> = Stream.combine(
    $content,
    $topbarHeight,
    $scroll,
    $isShown,
  )
    .filter(() => $isShown()) // filter 是一个操作符，用于过滤流中的值。只有通过过滤条件的值才会被发出。
    // 这里的 filter 操作符检查 $isShown() 是否为 true，即只有在目录显示时才会继续处理流中的值
    .map(([content, topbarHeight, _]) => {
      //       这里的 map 操作符接收一个数组 [content, topbarHeight, _]，其中：
      // content 是 Content 对象。
      // topbarHeight 是顶部栏的高度。
      // _ 是滚动事件（这里被忽略）。
      // 解构赋值，从 content 对象中提取 article、scroller 和 headings 属性。
      const { article, scroller, headings } = content
      // 检查 headings 是否存在且长度大于 0。如果不存在或长度为 0，则返回 0，表示没有激活的标题。
      if (!(headings && headings.length)) {
        return 0
      } else {
        // 调用 calcActiveHeading 函数计算当前激活的标题索引，并返回该索引。
        return calcActiveHeading({
          article,
          scroller,
          headings,
          topbarHeight: topbarHeight || 0,
        })
      }
    })

  // 看代码的入口
  return $activeHeading
}

// 提取内容流：这个函数通过监听窗口大小变化、内容变化等事件，提取文章内容和标题信息。
// 参数：
//   article - 文章的 HTML 元素
//   scroller - 滚动容器的 HTML 元素
//   $triggerContentChange - 触发内容变化的流
//   $isShown - 目录是否显示的流
//   $periodicCheck - 定期检查的流
//   addDisposer - 添加清理器的函数
function contentStream({
  $isShown,
  $periodicCheck,
  $triggerContentChange,
  article,
  scroller,
  addDisposer,
}: {
  article: HTMLElement
  scroller: HTMLElement
  $triggerContentChange: Stream<null>
  $isShown: Stream<boolean>
  $periodicCheck: Stream<null>
  addDisposer: (unsub: () => void) => number
}) {
  const $resize = Stream.fromEvent(window, 'resize', addDisposer)
    .throttle(100)
    .log('resize')

  const $content: Stream<Content> = Stream.merge(
    $triggerContentChange,
    $isShown,
    $resize,
    $periodicCheck,
  )
    .filter(() => $isShown())
    .map((): Content => {
      const articleRect = article.getBoundingClientRect()
      const scrollerRect =
        scroller === document.body || scroller === document.documentElement
          ? {
            left: 0,
            right: window.innerWidth,
            top: 0,
            bottom: window.innerHeight,
            height: window.innerHeight,
            width: window.innerWidth,
          }
          : scroller.getBoundingClientRect()
      const headings = extractHeadings(article)
      const scrollY = getScrollTop(scroller)
      const headingsMeasured = headings.map((h) => {
        const headingRect = h.dom.getBoundingClientRect()
        return {
          ...h,
          fromArticleTop:
            headingRect.top - (articleRect.top - article.scrollTop),
        }
      })
      return {
        article: {
          dom: article,
          fromScrollerTop:
            article === scroller
              ? 0
              : articleRect.top - scrollerRect.top + scrollY,
          left: articleRect.left,
          right: articleRect.right,
          height: articleRect.height,
        },
        scroller: {
          dom: scroller,
          rect: scrollerRect,
        },
        headings: headingsMeasured,
      }
    })

  return $content
}

// 计算顶部栏高度：函数计算并返回顶部栏的高度。
// 参数：
//   $triggerTopbarMeasure - 触发顶部栏测量的流
//   scroller - 滚动容器的 HTML 元素
function topbarStream($triggerTopbarMeasure: Stream<HTMLElement>, scroller: HTMLElement) {
  const getTopbarHeight = (targetElem: HTMLElement): number => {
    const findFixedParent = (elem: HTMLElement | null) => {
      const isFixed = (elem: HTMLElement) => {
        let { position, zIndex } = window.getComputedStyle(elem)
        return position === 'fixed' && zIndex
      }
      while (elem && elem !== document.body && !isFixed(elem) && elem !== scroller) {
        elem = elem.parentElement
      }
      return elem === document.body || elem === scroller ? null : elem
    }

    const { top, left, right, bottom } = targetElem.getBoundingClientRect()
    const leftTopmost = document.elementFromPoint(left + 1, top + 1)
    const rightTopmost = document.elementFromPoint(right - 1, top + 1)
    const leftTopFixed =
      leftTopmost && findFixedParent(leftTopmost as HTMLElement)
    const rightTopFixed =
      rightTopmost && findFixedParent(rightTopmost as HTMLElement)

    if (leftTopFixed && rightTopFixed && leftTopFixed === rightTopFixed) {
      return leftTopFixed.offsetHeight
    } else {
      return 0
    }
  }

  const $topbarHeightMeasured: Stream<number> = $triggerTopbarMeasure
    .throttle(50)
    .map((elem) => getTopbarHeight(elem))
    .unique()
    .log('topbarHeightMeasured')

  const $topbarHeight: Stream<number> = $topbarHeightMeasured.scan(
    (height, measured) => Math.max(height, measured),
    0 as number,
  )
  return $topbarHeight
}

// 创建目录：这个函数是整个工具的核心，负责创建目录并提供各种操作目录的方法，如显示、隐藏、切换、滚动到下一个或上一个标题等。
// 参数：
//   options - 包含文章元素和偏好的对象
//     article - 文章的 HTML 元素
//     preference - 目录偏好设置
export function createToc(options: {
  article: HTMLElement
  preference: TocPreference
}) {
  const article = options.article
  const scroller = getScrollElement(article)

  //-------------- Helpers --------------
  const disposers: (() => void)[] = []
  const addDisposer = (dispose: () => void) => disposers.push(dispose)
  const emitter = createEventEmitter<TocEvents>()

  //-------------- Triggers --------------
  const $triggerTopbarMeasure = Stream<HTMLElement>().log(
    'triggerTopbarMeasure',
  )
  const $triggerContentChange = Stream<null>(null).log('triggerContentChange')
  const $triggerIsShown = Stream<boolean>().log('triggerIsShown')
  const $periodicCheck = Stream.fromInterval(1000 * 60, addDisposer).log(
    'check',
  )

  //-------------- Observables --------------
  const $isShown = $triggerIsShown.unique().log('isShown')

  const $topbarHeight = topbarStream($triggerTopbarMeasure, scroller).log('topbarHeight')

  // 参数是通过对象解构传递的，因此顺序无关紧要。
  const $content = contentStream({
    $triggerContentChange,
    $periodicCheck,
    $isShown,
    article,
    scroller,
    addDisposer,
  }).log('content')

  const $activeHeading: Stream<number> = activeHeadingStream({
    scroller,
    $isShown,
    $content,
    $topbarHeight,
    addDisposer,
  }).log('activeHeading')

  const $offset = Stream<TocPreference['offset']>(
    options.preference.offset,
  ).log('offset')

  const $readableMode = Stream.combine(
    $isShown.unique(),
    $content.map((c) => c.article.height).unique(),
    $content.map((c) => c.scroller.rect.height).unique(),
    $content.map((c) => c.headings.length).unique(),
  )
    .map(([isShown]) => isShown)
    .log('readable')

  //-------------- Effects --------------
  // 滚动到指定标题
  // 参数：headingIndex - 标题索引
  // 返回值：Promise<void>
  const scrollToHeading = (headingIndex: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      const { headings, scroller } = $content()
      const topbarHeight = $topbarHeight()
      const heading = headings[headingIndex]
      if (heading) {
        const dm = document.domain;
        const isInoReader = dm.indexOf('inoreader.com') >= 0 || dm.indexOf('innoreader.com') > 0;
        smoothScroll({
          target: heading.dom,
          scroller: scroller.dom,
          topMargin: (topbarHeight || 0) + (isInoReader ? 50 : 10),
          callback() {
            $triggerTopbarMeasure(heading.dom)
            resolve()
          },
        })
      } else {
        resolve()
      }
    })
  }

  // 验证内容的有效性
  // 参数：content - 内容对象
  const validate = (content: Content): void => {
    const { article, headings, scroller } = content
    const isScrollerValid =
      document.documentElement === scroller.dom ||
      document.documentElement.contains(scroller.dom)
    const isArticleValid =
      scroller.dom === article.dom || scroller.dom.contains(article.dom)
    const isHeadingsValid =
      headings.length &&
      article.dom.contains(headings[0].dom) &&
      article.dom.contains(headings[headings.length - 1].dom)
    const isValid = isScrollerValid && isArticleValid && isHeadingsValid
    if (!isValid) {
      emitter.emit('error', { reason: 'Article Changed' })
    }
  }
  $content.subscribe(validate)

  let isRememberPos = true;
  chrome.storage.local.get({
    isRememberPos: true
  }, function (items) {
    isRememberPos = items.isRememberPos;
  });
  ui.render({
    $isShown,
    $article: $content.map((c) => c.article),
    $scroller: $content.map((c) => c.scroller),
    $headings: $content.map((c) => c.headings),
    $offset,
    $activeHeading,
    $topbarHeight,
    onDrag(offset) {
      $offset(offset)
      if (isRememberPos) {
        const data = {};
        data[offsetKey] = offset;
        chrome.storage.local.set(data, function () {
          //  no callback
        });
      }
    },
    onScrollToHeading: scrollToHeading,
  })

  //-------------- Exposed Commands --------------

  // 滚动到下一个标题
  const next = () => {
    const { headings } = $content()
    const activeHeading = $activeHeading()
    const nextIndex = Math.min(headings.length - 1, activeHeading + 1)
    scrollToHeading(nextIndex)
  }

  // 滚动到上一个标题
  const prev = () => {
    const activeHeading = $activeHeading()
    const prevIndex = Math.max(0, activeHeading - 1)
    scrollToHeading(prevIndex)
  }

  // 显示目录
  const show = () => {
    $triggerIsShown(true)
  }

  // 隐藏目录
  const hide = () => {
    $triggerIsShown(false)
  }

  // 切换目录显示/隐藏状态
  const toggle = () => {
    if ($isShown()) {
      hide()
    } else {
      show()
    }
  }

  // 销毁目录
  const dispose = () => {
    hide()
    disposers.forEach((dispose) => dispose())
    emitter.removeAllListeners()
  }

  // 获取目录偏好设置
  const getPreference = (): TocPreference => {
    return {
      offset: $offset(),
    }
  }

  return {
    ...emitter,
    show,
    hide,
    toggle,
    prev,
    next,
    getPreference,
    dispose,
  }
}

// 定义一个类型 Toc，这个类型是 createToc 函数返回值的类型
// 这个返回值定义了很多动作，实在是太灵活了
export type Toc = ReturnType<typeof createToc>
