interface Feed {
  name: string;
  url: string;  // Scheme-less URL (e.g. "medium.com/feed/@user") — popup prepends "https://" at render time
  type: 'user' | 'publication';
}

const getCurrentTab = (cb) => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
    cb(activeTab)
  })
}

const execOnCurrentTab = (command) => {
  getCurrentTab((tab) => {
    if (tab && tab.url.indexOf("chrome") !== 0) {
      chrome.tabs.sendMessage(tab.id, command, {}, () => {
        chrome.runtime.lastError // suppress unchecked error
      })
    }
  })
}

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
    const feedbackFormId =
      '1FAIpQLSdwZSYMRBXmb3BU1lIm7LC5e8OZxYQFg_F2phvvAf0X-zhIDQ';
    const feedbackFormUrl = `https://docs.google.com/forms/d/e/${feedbackFormId}/viewform`;
    if (chrome.runtime.setUninstallURL) {
      chrome.runtime.setUninstallURL(feedbackFormUrl);
    }
  }
});


const generateFeeds = (
  userFeed: string | null,
  mediumPublication: string | null,
  publicationDomain: string | null
): Feed[] => {
  const feeds: Feed[] = []
  if (userFeed) {
    feeds.push({ name: 'User Feed', url: userFeed, type: 'user' })
  }
  if (mediumPublication) {
    feeds.push({ name: 'Publication Feed', url: `medium.com/feed/${mediumPublication}`, type: 'publication' })
  } else if (publicationDomain) {
    feeds.push({ name: 'Publication Feed', url: `${publicationDomain}feed`, type: 'publication' })
  }
  return feeds
}

// Track the last URL per tab to prevent duplicate processing
const lastUrlByTab = new Map<number, string>()

console.log('[bg] background.ts loaded, version=2')

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url !== lastUrlByTab.get(tabId)) {
    lastUrlByTab.set(tabId, tab.url)

    if (/-[0-9a-z]{10,}$/.test(tab.url)) {
      setTimeout(() => {
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: (currentUrl) => {
            const urlObj = new URL(currentUrl)
            const articleId = /-([0-9a-z]{10,})$/.exec(urlObj.pathname)?.[1]
            if (articleId) {
              // Primary: <link rel="alternate" type="application/rss+xml"> in <head>
              const alternateFeedLinks = Array.from(
                document.querySelectorAll('link[rel="alternate"][type="application/rss+xml"]')
              ).map(el => (el as HTMLLinkElement).href)

              // Secondary: <a> links with /feed in href
              const anchorFeedLinks = Array.from(
                document.querySelectorAll('a[href*="/feed"]')
              ).map(el => (el as HTMLAnchorElement).href)

              // Tertiary: author profile links (/@username), excluding commenter links
              // Commenters have ?source=...post_responses... in URL; author byline does not
              const authorProfileLinks = Array.from(
                document.querySelectorAll('a[href*="/@"]')
              ).map(el => (el as HTMLAnchorElement).href)
                .filter(href => {
                  try {
                    const u = new URL(href)
                    if (u.searchParams.get('source')?.includes('post_responses')) return false
                    return /^\/@[^/?]+\/?$/.test(u.pathname)
                  } catch { return false }
                })

              const links = [...new Set([...alternateFeedLinks, ...anchorFeedLinks, ...authorProfileLinks])]
              return { isMediumPage: true, articleId, links }
            }
            return { isMediumPage: false, articleId: null, links: [] }
          },
          args: [tab.url]
        },
          (results) => {
            if (results && results[0] && results[0].result) {
              const { isMediumPage, links } = results[0].result
              if (isMediumPage) {
                // Explicit feed links from <link rel="alternate"> or <a href*="/feed">
                const standardUserFeedLink = links.find((l) => l.includes('/feed/@'))
                const customUserFeedLink = links.find((l) => /\/\/[^/.]+\.medium\.com\/feed(?:\/|\?|$)/.test(l))
                const userFeedLink = standardUserFeedLink ?? customUserFeedLink ?? null

                const pubFeedLink = links.find(
                  (l) =>
                    l !== userFeedLink &&
                    ((l.includes('/feed/') && !l.includes('/feed/@')) ||
                      /\/\/medium\.[^.]+\.[^/]+\/feed(?:\/|\?|$)/.test(l))
                )

                const userPath = userFeedLink?.match(/\/\/([^?]+)/)?.[1] ?? null
                const pubPath  = pubFeedLink?.match(/\/\/([^?]+)/)?.[1] ?? null

                // Fallback: construct author feed from byline link (any domain, /@username path)
                const authorLink = !userPath
                  ? links.find((l) => { try { return /^\/@[^/?]+\/?$/.test(new URL(l).pathname) } catch { return false } })
                  : undefined
                const authorFeed = authorLink
                  ? (() => { try { const u = new URL(authorLink); return `${u.hostname}/feed${u.pathname.replace(/\/$/, '')}` } catch { return null } })()
                  : null

                const userFeed = userPath
                  ? userPath.includes('/feed') ? userPath : userPath.replace(/\/?$/, '/feed')
                  : authorFeed

                // Fallback: extract publication slug directly from the article URL path
                // e.g. medium.com/predict/article-slug → "predict"
                const urlParts = new URL(tab.url).pathname.split('/').filter(Boolean)
                const publicationFromUrl = urlParts.length >= 2 && urlParts[0] && !urlParts[0].startsWith('@')
                  ? urlParts[0] : null

                const mediumPublication =
                  pubPath?.match(/medium\.com\/feed\/([^/?]+)/)?.[1] ?? publicationFromUrl ?? null
                const publicationDomain =
                  !mediumPublication && pubPath ? pubPath : null

                const feeds = generateFeeds(userFeed, mediumPublication, publicationDomain)
                chrome.action.setBadgeText({ text: feeds.length.toString(), tabId: tabId });
                chrome.action.setBadgeBackgroundColor({ color: '#070707', tabId: tabId });
                chrome.storage.local.set({ [`feeds_${tabId}`]: feeds });
              } else {
                chrome.action.setBadgeText({ text: '', tabId: tabId });
              }
            }
          }
        )
      }, 1000)
    } else {
      chrome.action.setBadgeText({ text: '', tabId: tabId });
    }
  }
});

// Clean up per-tab state when a tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  lastUrlByTab.delete(tabId)
  chrome.storage.local.remove(`feeds_${tabId}`)
})