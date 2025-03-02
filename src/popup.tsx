import { useState, useEffect } from "react"

interface Feed {
  name: string;
  url: string;
}

function IndexPopup() {
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [isMediumPage, setIsMediumPage] = useState(false)

  useEffect(() => {
    chrome.storage.local.get('feeds', (result) => {
      if (result.feeds) {
        setFeeds(result.feeds)
      }
    })
    chrome.storage.local.get('isMediumPage', (result) => {
      if (result.isMediumPage) {
        setIsMediumPage(result.isMediumPage)
      }
    })

    // chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    //   if (message.type === 'updateFeeds') {
    //     setFeeds(message.feeds)

    //   }
    // })
  }, [])

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
          Welcome to follow me:<a href="https://wesley-wei.medium.com/" target="_blank" rel="noopener noreferrer">
            @WesleyWei
          </a>
        </p>
      </footer>
    </div>
  )
}

export default IndexPopup