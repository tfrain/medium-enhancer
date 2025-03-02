interface Feed {
  name: string;
  url: string;
}

const getCurrentTab = (cb) => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
    cb(activeTab)
  })
}

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

// 监听扩展图标 onClicked 事件
// 监听快捷键命令
chrome.commands.onCommand.addListener((command) => execOnCurrentTab(command))

// 在扩展安装时创建上下文菜单项并打开选项页面
chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({
    id: "position_menu",
    title: "Reset TOC Position",
    type: 'normal',
    contexts: ["all"],
  });
  // wwtd P1，end
  // let url = chrome.runtime.getURL("options.html");
  // await chrome.tabs.create({ url });
});

chrome.contextMenus.onClicked.addListener(function (item, tab) {
  if (item.menuItemId === 'position_menu') {
    if (chrome.storage) {
      chrome.storage.local.set({ "mediumtoc_offset": { x: 0, y: 0 } });
      execOnCurrentTab('refresh')
    }
  }
});

// chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
//   getCurrentTab(tab => {
//     if (tab) {
//       if (request == 'unload') {
//         // chrome.action.setIcon({
//         //   tabId: tab.id,
//         //   path: "icon_gray.png"
//         // });
//       }
//       else if (request === 'load') {
//         // chrome.action.setIcon({
//         //   tabId: tab.id,
//         //   path: "icon.png"
//         // });
//       }
//     }
//   });
//   sendResponse(true)
// });


chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    chrome.scripting.executeScript(
      {
        target: { tabId: tabId },
        func: (currentUrl) => {
          const urlObj = new URL(currentUrl)
          const articleId = /-([0-9a-z]{10,})$/.exec(urlObj.pathname)?.[1]
          if (articleId) {
            const queryData = `a[href*="${articleId}"]`
            const links = Array.from(document.querySelectorAll(queryData)).map(link => link.href)
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
            const link1 = links[1].match(/\/\/([^?]+)/)?.[1];
            const link2 = links[2].match(/\/\/([^?]+)/)?.[1];
            // 1. medium.com/@Alizay_Yousfzai?
            // 2. medium.com/feed/@Alizay_Yousfzai?

            // 1. medium.com/feed/@tugce-ercem-isaacs?
            // 2. medium.com/language-lab?

            // 1. medium.com/feed/language-lab
            // 2. medium.com/feed/language-lab/tagged/golang

            // 1. wesley-wei.medium.com/?
            // 2. medium.programmerscareer.com/?
            // 3. wesley-wei.medium.com/feed
            // 4. medium.programmerscareer.com/feed
            // 5. medium.programmerscareer.com/feed/tagged/golang
            let userFeed = null;
            let publicationDomain = null;
            let mediumPublication = null;

            if (link1.includes('@')) {
              // 仅有非自定义用户
              const username = link1.split('@')[1];
              userFeed = `medium.com/feed/@${username}`;
              if (link1 !== link2) {
                // 非自定义用户+非自定义出版物
                mediumPublication = link2.match(/medium\.com\/([^?]+)/)?.[1]
                if (!mediumPublication) {
                  // const publicationUrl = new URL(link2)
                  // publicationDomain = publicationUrl.hostname
                  // 非自定义用户+自定义出版物
                  publicationDomain = link2
                }
              }
            } else {
              // console.log({ link1, link2 })
              // 自定义用户
              userFeed = link1 + 'feed'
              // 自定义用户+非自定义出版物
              mediumPublication = link2.match(/medium\.com\/([^?]+)/)?.[1]
              if (!mediumPublication) {
                // const publicationUrl = new URL(link2)
                // publicationDomain = publicationUrl.hostname
                // 自定义用户+自定义出版物
                publicationDomain = link2
              }
            }

            // tags
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
  }
});

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