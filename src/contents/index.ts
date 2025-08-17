import { extractArticle, extractHeadings } from './lib/extract'
import { getContentWindow } from './lib/iframe'
import { createToc, type Toc, type TocPreference } from './toc'
import { isDebugging, offsetKey } from './util/env'
import { showToast } from './util/toast'
import type { PlasmoCSConfig } from "plasmo"

/**
 * Configuration for the Plasmo content script
 * Specifies when and where the script should run
 */
export const config: PlasmoCSConfig = {
  matches: [
    "http://*/*",
    "https://*/*"
  ],
  run_at: "document_end",
}

/**
 * Sets TOC position preferences based on stored settings
 * @param preference - The preference object to update
 * @param callback - Optional callback function to execute after preferences are set
 */
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

/**
 * Checks if a URL is a valid Medium article URL
 * Medium article URLs typically end with a dash followed by a 10+ character ID
 * @param url - The URL to check
 * @returns True if the URL matches the Medium article pattern
 */
function isValidUrl(url: string): boolean {
  const regex = /-[0-9a-z]{10,}$/;
  return regex.test(url);
}

if (window === getContentWindow()) {
  let preference: TocPreference = {
    offset: { x: 0, y: 0 },
  }
  let isLoad = false;
  let isNewArticleDetected = true
  let hasShownNoArticleToast = false  // Add this line to track toast display status

  let toc: Toc | undefined

  /**
   * Starts the TOC generation process
   * Extracts the article and headings, then renders the TOC
   */
  const start = (): void => {
    const article = extractArticle()
    const headings = article && extractHeadings(article)
    renderToc(article, headings)
  }

  /**
   * Renders the Table of Contents for the article
   * @param article - The article element
   * @param headings - Array of heading elements found in the article
   */
  const renderToc = (article, headings): void => {
    if (toc) {
      toc.dispose()
    }
    if (isMediumOrInoreader && (isInoReaderCom || (isMediumComPrefix && !isValidUrl(window.location.pathname)))) {
      return
    }

    if (!(article && headings && headings.length)) {
      // Add delayed check
      setTimeout(() => {
        const newArticle = extractArticle()
        const newHeadings = newArticle && extractHeadings(newArticle)
        if (!(newArticle && newHeadings && newHeadings.length)) {
          chrome.storage.local.get({
            isShowTip: true
          }, function (items) {
            if (items.isShowTip && !hasShownNoArticleToast) {
              showToast('No article/headings are detected.')
              hasShownNoArticleToast = true
        }
      });
    } else {
      renderToc(newArticle, newHeadings)
    }
  }, 500)
  return
}
hasShownNoArticleToast = false  // Reset status
    isNewArticleDetected = true

    toc = createToc({
      article,
      preference,
    })
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
    var MutationObserver =
      window.MutationObserver || window.WebKitMutationObserver
    if (typeof MutationObserver !== 'function') {
      console.error(
        'DOM Listener Extension: MutationObserver is not available in your browser.',
      )
      return
    }

    let domChangeCount = 0;
    // 每次config中的dom内容变化，都会触发callback
    const callback = function (mutationsList, observer) {
      clearInterval(timeoutTrack);
      domChangeCount++;
      let intervalCount = 0;
      // 每 300 毫秒执行一次，2/3次时可能渲染目录，直至4次结束
      timeoutTrack = setInterval(() => {
        intervalCount++;
        if (intervalCount === 4) {
          clearInterval(timeoutTrack)
        }
        if (isDebugging) {
          console.log({ domChangeCount, intervalCount, isNewArticleDetected });
        }
        domChangeCount = 0;
        if (intervalCount == 1) {
          setPreference(preference, trackArticle)
        } else if (intervalCount > 1 && !isNewArticleDetected) {
          detectToc() // 后续执行时，检测并渲染出目录
        }
      }, 300);
    }
    if (observer === null) {
      observer = new MutationObserver(callback)
    }
    else {
      observer.disconnect()
    }

    const config = {
      attributes: true,
      attributeOldValue: true,
      subtree: true,
      childList: true
    }
    observer.observe(document, config)
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

  // Extract article each time DOM changes (Medium page switch, Inoreader subpage switch)
  function trackArticle() {
    const articleClass = mediumArticle != null ? selectorMedium : selectorInoreader;
    const el: HTMLElement = document.querySelector(articleClass) as HTMLElement;
    let isArticleChanged = (el && (el.id !== articleId || el.className !== articleContentClass)) || !el
    if (isArticleChanged) {
      isNewArticleDetected = false
    hasShownNoArticleToast = false  // Add this line to reset toast status
      if (isDebugging) {
        console.log('refresh')
      }
      articleId = el ? el.id : ''
      articleContentClass = el ? el.className : ''
      // Without start(), TOC won't be canceled promptly; with start(), "no headings" may show because content isn't fully loaded
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
      // wwtd P2 不优雅的处理
      if (isMediumCom || isInoReaderCom) {
        start();
      }
    }
  }

  function detectToc() {
    const article = extractArticle()
    const headings = article && extractHeadings(article)
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
  let isMediumComPrefix = dm.indexOf('medium.com') >= 0;
  let isMediumCom = dm === 'medium.com'
  let isInoReaderCom = dm === 'inoreader.com' || dm === 'innoreader.com';
  let isMediumOrInoreader = isInoReader || isMediumComPrefix || mediumArticle !== null;

  chrome.storage.local.get({
    autoType: '2'
  }, function (items) {
    if (items.autoType !== '0') {
      let isAutoLoad = items.autoType === '1';
      if (items.autoType === '2') {
        isAutoLoad = isMediumOrInoreader;
      }
      // load 中会 start，也会调用 domListener
      if (isAutoLoad) {
        load();
      }
    }
  });

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