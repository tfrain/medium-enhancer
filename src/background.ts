// wwtd P1 更新连接，提醒用户去选项页面
// wwtd P1 更改插件颜色
const getCurrentTab = (cb) => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
    cb(activeTab)
  })
}

// 在当前活动标签页上执行命令
// 参数：command - 要执行的命令
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
  // wwtd P1，end。跳转到选项页面，最后再打开这里
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

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  getCurrentTab(tab => {
    if (tab) {
      if (request == 'unload') {
        // chrome.action.setIcon({
        //   tabId: tab.id,
        //   path: "icon_gray.png"
        // });
      }
      else if (request === 'load') {
        // chrome.action.setIcon({
        //   tabId: tab.id,
        //   path: "icon.png"
        // });
      }
    }
  });
  sendResponse(true)
});