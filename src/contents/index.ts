import { extractArticle, extractHeadings } from './lib/extract'
import { getContentWindow } from './lib/iframe'
import { createToc, type Toc, type TocPreference } from './toc'
import { isDebugging, offsetKey } from './util/env'
import { showToast } from './util/toast'
import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: [
    "http://*/*",
    "https://*/*"
  ],
  run_at: "document_end",
}

// 记住当前的位置，从这个位置展开目录
function setPreference(preference, callback) {
  if (chrome.storage && chrome.storage.local) {
    const defaultOptions = {
      isRememberPos: true
    }
    defaultOptions[offsetKey] = { x: 0, y: 0 };
    chrome.storage.local.get(defaultOptions, function (result) {
      const offset = result[offsetKey];
      if (result.isRememberPos) {
        preference.offset.x = offset.x;
        preference.offset.y = offset.y;
      }
      else {
        preference.offset.x = 0;
        preference.offset.y = 0;
      }
      if (callback) {
        callback();
      }
    });
  }
  else if (callback) {
    callback();
  }
}

// 检查 URL 是否包含特定后缀
function isValidUrl(url: string): boolean {
  const regex = /-[0-9a-z]{10,}$/;
  return regex.test(url);
}

// 只有在当前窗口与内容窗口相同时，才会执行以下代码
if (window === getContentWindow()) {
  let preference: TocPreference = {
    offset: { x: 0, y: 0 },
  }
  let isLoad = false;
  let isNewArticleDetected = true

  let toc: Toc | undefined

  const start = (): void => {
    // 提取文章和标题
    const article = extractArticle()
    const headings = article && extractHeadings(article)
    renderToc(article, headings)
  }

  const renderToc = (article, headings): void => {
    if (toc) {
      toc.dispose()
    }
    if (isInoReaderCom || !isValidUrl(window.location.pathname)) {
      return
    }

    if (!(article && headings && headings.length)) {
      chrome.storage.local.get({
        isShowTip: true
      }, function (items) {
        if (items.isShowTip) {
          showToast('No article/headings are detected.')
        }
      });
      return
    }
    isNewArticleDetected = true

    toc = createToc({
      article,
      preference,
    })
    // 出现错误时，销毁目录
    toc.on('error', (error) => {
      if (toc) {
        toc.dispose()
        toc = undefined
      }
      // start()
    })
    toc.show()
  }

  chrome.runtime.onMessage.addListener(
    (request: 'toggle' | 'prev' | 'next' | 'refresh' | 'load' | 'unload', sender, sendResponse) => {
      // load/ unload 还是会传递消息，但是直接返回，意义在哪？
      if (request === 'load' || request === 'unload') {
        sendResponse(true)
        return
      }
      try {
        if (!isLoad || request === 'refresh') {
          load();
        } else {
          if (toc) {
            toc[request]()
          }
          if (isLoad && request === 'toggle') {
            unload()
          }
        }
        sendResponse(true)
      } catch (e) {
        console.error(e)
        sendResponse(false)
      }
    },
  )

  let observer: any = null;
  let timeoutTrack: any = null;

  function domListener() {
    // 获取 MutationObserver 构造函数
    var MutationObserver =
      window.MutationObserver || window.WebKitMutationObserver
    // 检查浏览器是否支持 MutationObserver
    if (typeof MutationObserver !== 'function') {
      console.error(
        'DOM Listener Extension: MutationObserver is not available in your browser.',
      )
      return
    }

    let domChangeCount = 0; // 记录 DOM 变化的次数（在一片文章多次加载的场景？）
    // 每次config中的dom内容变化，都会触发callback
    const callback = function (mutationsList, observer) {
      clearInterval(timeoutTrack); // 清除之前的定时器
      domChangeCount++; // 增加 DOM 变化计数
      let intervalCount = 0; // 记录定时器执行次数
      // 每 300 毫秒执行一次，2/3次时可能渲染目录，直至4次结束
      timeoutTrack = setInterval(() => {
        intervalCount++;
        // medium 文章中会不断refresh，走不到这里，而主页会走到这里
        if (intervalCount === 4) { // 最多检测次数
          clearInterval(timeoutTrack) // 清除定时器
        }
        if (isDebugging) {
          console.log({ domChangeCount, intervalCount, isNewArticleDetected });
        }
        domChangeCount = 0; // 重置 DOM 变化计数
        if (intervalCount == 1) {
          setPreference(preference, trackArticle) // 第一次执行时，和 load 无异
        } else if (intervalCount > 1 && !isNewArticleDetected) {
          detectToc() // 后续执行时，检测并渲染出目录
        }
      }, 300);
    }

    // 如果 observer 为 null，则创建一个新的 MutationObserver 实例
    if (observer === null) {
      observer = new MutationObserver(callback)
    }
    else {
      observer.disconnect()
    }

    // 配置 MutationObserver 的选项
    const config = {
      attributes: true, // 观察属性变化
      attributeOldValue: true, // 记录旧的属性值
      subtree: true, // 观察整个子树
      childList: true // 观察子节点的变化
    }
    observer.observe(document, config) // 开始观察文档的变化
  }

  let articleId = ''
  let articleContentClass = ''
  let selectorInoreader = '.article_content'
  let selectorMedium = 'article'

  chrome.storage.local.get({
    selectorInoreader: '.article_content',
    selectorMedium: 'article'
  }, function (items) {
    selectorInoreader = items.selectorInoreader
    selectorMedium = items.selectorMedium
  });

  // 每次dom变化时（meidum切换页面， innoreader切换子页面），都会重新提取文章
  function trackArticle() {
    const articleClass = mediumArticle != null ? selectorMedium : selectorInoreader;
    const el: HTMLElement = document.querySelector(articleClass) as HTMLElement;
    let isArticleChanged = (el && (el.id !== articleId || el.className !== articleContentClass)) || !el
    if (isArticleChanged) {
      isNewArticleDetected = false
      if (isDebugging) {
        console.log('refresh')
        // console.log(el)
      }
      articleId = el ? el.id : ''
      articleContentClass = el ? el.className : ''
      // 这里的start 和 下面这段重复，有start 只是为了更快加载，当然要 isNewArticleDetected 为 false
      // if (intervalCount > 1 && !isNewArticleDetected) {
      //   detectToc() // 后续执行时，检测并渲染出目录
      // }

      const observer = new MutationObserver((mutations, obs) => {
        const articleLoaded = document.querySelector(articleClass);
        if (articleLoaded) {
          start();
          obs.disconnect();
        }
      });

      observer.observe(document, {
        childList: true,
        subtree: true
      });
    }
  }

  // domListener 中检测并设置（检测到）目录
  function detectToc() {
    const article = extractArticle()
    const headings = article && extractHeadings(article)
    if (isMediumCom && toc) {
      toc.dispose()
    }
    if (article && headings && headings.length > 0) {
      setPreference(preference, () => {
        renderToc(article, headings)
      });
      clearInterval(timeoutTrack)
    }
  }

  const dm = document.domain
  const isInoReader =
    dm.indexOf('inoreader.com') >= 0 || dm.indexOf('innoreader.com') > 0
  const container = document.getElementById("root") as HTMLElement | null;
  let mediumArticle = container != null && document.querySelector(selectorMedium) as HTMLElement || null
  let isMediumCom = dm.indexOf('medium.com') >= 0;
  // wwtd P1, 部分 innoreader 目录无法展示。
  let isInoReaderCom = dm === 'inoreader.com' || dm === 'innoreader.com';

  // 默认展示
  chrome.storage.local.get({
    autoType: '2'
  }, function (items) {
    if (items.autoType !== '0') { // 禁用
      let isAutoLoad = items.autoType === '1'; // 所有页面
      if (items.autoType === '2') {
        isAutoLoad = isInoReader || isMediumCom || mediumArticle !== null;
      }
      // load 中会 start，也会调用 domListener
      if (isAutoLoad) {
        load();
      }
    }
  });


  // background 会发送 load/unload 消息，这里会接收到
  function load() {
    chrome.runtime.sendMessage("load")
    isLoad = true
    setPreference(preference, start);
    domListener()
  }

  function unload() {
    chrome.runtime.sendMessage("unload")
    isLoad = false
    if (toc) {
      toc.dispose()
    }
    if (observer !== null) {
      observer.disconnect()
      observer = null
    }
  }
}