import { useState, useEffect } from "react"

interface Feed {
  name: string;
  url: string;
}

function IndexPopup() {
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [isMediumPage, setIsMediumPage] = useState(false)

  useEffect(() => {
    // 获取当前标签页的 URL
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (/-[0-9a-z]{10,}$/.test(tab.url)) {
        chrome.storage.local.get(['feeds', 'isMediumPage'], (result) => {
          if (result.feeds) setFeeds(result.feeds);
          setIsMediumPage(true);  // 直接设置为 true
        });
      } else {
        setIsMediumPage(false);
        setFeeds([]);
      }
    });

    const storageListener = (changes) => {
      if (changes.feeds) {
        setFeeds(changes.feeds.newValue || []);
      }
    };

    chrome.storage.onChanged.addListener(storageListener);

    return () => {
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: 10,
        width: "600px",
        fontSize: "20px"
      }}>
      <h1>Possible RSS Feeds</h1>
      {isMediumPage ? (
        <ul>
          {feeds.map((feed, index) => (
            <li key={index}>
              <a href={`https://${feed.url}`} target="_blank" rel="noopener noreferrer">
                {feed.name}
              </a>
              &nbsp;|&nbsp;
              <a href={`https://www.inoreader.com/search/feeds/${encodeURIComponent(`https://${feed.url}`)}`} target="_blank" rel="noopener noreferrer">
                inoreader
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p>This is not a Medium Article page.</p>
      )}
      <footer>
        <p>
          Welcome to follow my Medium:<a href="https://wesley-wei.medium.com/" target="_blank" rel="noopener noreferrer">
            @WesleyWei
          </a>
          <br />
          Send me feedback via: <a href="https://t.me/tfrain_w" target="_blank">My telegram</a>
        </p>
      </footer>
    </div>
  )
}

export default IndexPopup