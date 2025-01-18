// 为什么 Service Worker 是 Inactive？
// Service Worker 在未监听事件时会自动进入 Inactive 状态。确保代码中设置了监听器，如 chrome.runtime.onMessage。
// 需要先修好 content页面的问题
console.log(
  "Live now; make now always the most precious time. Now will never come again."
)

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
          // content_script 正常加载
        } else {
          if (command === 'toggle' && response === undefined) {
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

// 监听扩展图标点击事件
chrome.action.onClicked.addListener(() => execOnCurrentTab('toggle'))
// 监听快捷键命令
chrome.commands.onCommand.addListener((command) => execOnCurrentTab(command))

chrome.runtime.onInstalled.addListener(async () => {
  console.log("Extension installed or updated");
  chrome.contextMenus.create({
    id: "position_menu",
    title: "Reset TOC Position",
    type: 'normal',
    contexts: ["all"],
  }, () => {
    if (chrome.runtime.lastError) {
      console.error("Error creating context menu:", chrome.runtime.lastError);
    } else {
      console.log("Context menu item created successfully");
    }
  });
});

chrome.contextMenus.onClicked.addListener(function (item, tab) {
  if (item.menuItemId === 'position_menu') {
    if (chrome.storage) {
      chrome.storage.local.set({ "smarttoc_offset": { x: 0, y: 0 } });
      execOnCurrentTab('refresh')
    }
  }
});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  getCurrentTab(tab => {
    if (tab) {
      if (request == 'unload') {
        chrome.action.setIcon({
          tabId: tab.id,
          path: "icon_gray.png"
        });
      }
      else if (request === 'load') {
        chrome.action.setIcon({
          tabId: tab.id,
          path: "icon.png"
        });
      }
    }
  });
  sendResponse(true)
});