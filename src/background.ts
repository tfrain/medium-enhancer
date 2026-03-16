/**
 * Interface representing a RSS feed with name and URL
 */
interface Feed {
  name: string; // Display name of the feed
  url: string;  // URL of the feed
}

/**
 * Gets the current active tab and passes it to the callback function
 * @param cb - Callback function that receives the active tab
 */
const getCurrentTab = (cb) => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
    cb(activeTab)
  })
}

/**
 * Executes a command on the current tab
 * If the tab doesn't respond, attempts to inject the TOC script
 * @param command - Command to execute ('toggle', 'prev', 'next', etc.)
 */
const execOnCurrentTab = (command) => {
  getCurrentTab((tab) => {
    if (tab && tab.url.indexOf("chrome") !== 0) {
      chrome.tabs.sendMessage(tab.id, command, {}, (response) => {
        if (!chrome.runtime.lastError) {
          console.log({ response })
        } else {
          if (command === 'toggle' && response === undefined) {
            // wwtd P2，无法识别。 这里不能识别到toc.ts，考虑将文件名存储起来，toc.86b6409e.js，然后这里进行获取，但是不急
            chrome.scripting.executeScript({
              target: { tabId: tab.id, allFrames: true },
              files: ['toc.ts']
            }, () => {
              chrome.tabs.sendMessage(tab.id, command, {}, (response) => { }) // load then send again
            })
          }
        }
      })
    }
  })
}

// Listen for extension icon onClicked event
// Listen for keyboard shortcut commands
chrome.commands.onCommand.addListener((command) => execOnCurrentTab(command))

chrome.contextMenus.onClicked.addListener(function (item, tab) {
  if (item.menuItemId === 'position_menu') {
    if (chrome.storage) {
      chrome.storage.local.set({ "mediumtoc_offset": { x: 0, y: 0 } });
      execOnCurrentTab('refresh')
    }
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  chrome.contextMenus.create({
    id: "position_menu",
    title: "Reset TOC Position",
    type: 'normal',
    contexts: ["all"],
  });
  if (['install', 'update'].includes(details.reason)) {
    let url = chrome.runtime.getURL("options.html");
    await chrome.tabs.create({ url });
    // chrome.tabs.create({ url: 'https://medium.programmerscareer.com/' });
    // https://docs.google.com/forms/d/e/1FAIpQLSdwZSYMRBXmb3BU1lIm7LC5e8OZxYQFg_F2phvvAf0X-zhIDQ/viewform
    const feedbackFormId =
      '1FAIpQLSdwZSYMRBXmb3BU1lIm7LC5e8OZxYQFg_F2phvvAf0X-zhIDQ';
    const feedbackFormUrl = `https://docs.google.com/forms/d/e/${feedbackFormId}/viewform`;
    if (chrome.runtime.setUninstallURL) {
      chrome.runtime.setUninstallURL(feedbackFormUrl);
    }
  }
});


// 添加一个变量来跟踪上一次的 URL
let lastUrl = '';

/**
 * Listens for tab updates to detect Medium articles and extract RSS feeds
 * Only processes when page is fully loaded and URL has changed
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only execute when page is fully loaded and URL is different from last time
  if (changeInfo.status === 'complete' && tab.url && tab.url !== lastUrl) {
    lastUrl = tab.url;

    // 检查是否是 Medium 文章页面
    if (/-[0-9a-z]{10,}$/.test(tab.url)) {
      setTimeout(() => {
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: (currentUrl) => {
            const urlObj = new URL(currentUrl)
            const articleId = /-([0-9a-z]{10,})$/.exec(urlObj.pathname)?.[1]
            if (articleId) {
              const queryData = `a[href*="${articleId}"]`
              const links = Array.from(document.querySelectorAll(queryData))
                .map(link => (link as HTMLAnchorElement).href)
              return { isMediumPage: true, articleId, links }
            }
            return { isMediumPage: false, articleId: null, links: [] }
          },
          args: [tab.url]
        },
          (results) => {
            if (results && results[0] && results[0].result) {
              const { isMediumPage, articleId, links } = results[0].result
              // setIsMediumPage(isMediumPage)
              if (isMediumPage) {
                // setArticleId(articleId)
                // Semantic search — safe regardless of link count or order
                // Standard user: contains /feed/@ (medium.com/@user)
                const standardUserFeedLink = links.find((l) => l.includes('/feed/@'))

                // Custom subdomain user: *.medium.com/feed (e.g. wesley-wei.medium.com/feed)
                const customUserFeedLink = links.find((l) => /\/\/[^/.]+\.medium\.com\/feed(?:\/|\?|$)/.test(l))

                const userFeedLink = standardUserFeedLink ?? customUserFeedLink ?? null

                // Publication: /feed/ with a slug (no @), or custom non-medium.com domain /feed
                const pubFeedLink = links.find(
                  (l) =>
                    l !== userFeedLink &&
                    ((l.includes('/feed/') && !l.includes('/feed/@')) ||
                      /\/\/medium\.[^.]+\.[^/]+\/feed(?:\/|\?|$)/.test(l))
                )

                // Optional chaining throughout — never crashes on undefined
                const userPath = userFeedLink?.match(/\/\/([^?]+)/)?.[1] ?? null
                const pubPath  = pubFeedLink?.match(/\/\/([^?]+)/)?.[1] ?? null

                // Normalise: ensure userFeed ends with /feed
                const userFeed = userPath
                  ? userPath.includes('/feed') ? userPath : userPath.replace(/\/?$/, '/feed')
                  : null

                const mediumPublication =
                  pubPath?.match(/medium\.com\/feed\/([^/?]+)/)?.[1] ?? null
                const publicationDomain =
                  !mediumPublication && pubPath ? pubPath : null

                // Extract tags from URLs
                const tags = links.map(url => {
                  const match = url.match(/tag\/([^/?]+)/);
                  return match ? match[1] : null;
                }).filter(tag => tag !== null);

                const feeds = generateFeeds(userFeed, mediumPublication, publicationDomain, tags)
                chrome.action.setBadgeText({ text: feeds.length.toString(), tabId: tabId });
                chrome.action.setBadgeBackgroundColor({ color: '#070707', tabId: tabId });
                chrome.storage.local.set({ feeds });
                chrome.storage.local.set({ isMediumPage: true });
              } else {
                chrome.action.setBadgeText({ text: '', tabId: tabId });
                chrome.storage.local.set({ isMediumPage: false });
              }
            }
          }
        )
      }, 1000)  // Add delay to ensure DOM is fully loaded
    } else {
      chrome.action.setBadgeText({ text: '', tabId: tabId });
      chrome.storage.local.set({ isMediumPage: false });
    }
  }
});

/**
 * Generates a list of RSS feeds based on user, publication, and tags
 * @param userFeed - User feed URL
 * @param mediumPublication - Medium publication name
 * @param publicationDomain - Custom publication domain
 * @param tags - Array of tags found in the article
 * @returns Array of Feed objects with name and URL
 */
const generateFeeds = (userFeed: string, mediumPublication: string, publicationDomain: string, tags: string[]) => {
  const feeds: Feed[] = []
  if (userFeed) {
    // Profile page feed
    feeds.push({ name: 'user feed', url: userFeed })
  }
  if (mediumPublication) {
    // Publication page feed
    feeds.push({ name: 'publication feed', url: `medium.com/feed/${mediumPublication}` })
  } else if (publicationDomain) {
    feeds.push({ name: 'publication feed', url: `${publicationDomain}feed` })
  }
  if (tags) {
    if (mediumPublication) {
      tags.forEach(tag => {
        feeds.push({ name: `${tag} feed of publication`, url: `medium.com/feed/${mediumPublication}/tagged/${tag}` })
      })
    } else if (publicationDomain) {
      // https://medium.programmerscareer.com/feed/tagged/technology
      tags.forEach(tag => {
        feeds.push({ name: `${tag} feed of publication`, url: `${publicationDomain}feed/tagged/${tag}` })
      })
    }
    // https://medium.com/feed/tag/technology
  }
  return feeds
}