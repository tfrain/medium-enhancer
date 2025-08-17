import { useState, useEffect } from "react"

/**
 * Interface representing a RSS feed with name and URL
 */
interface Feed {
  name: string; // Display name of the feed
  url: string;  // URL of the feed
}

/**
 * Main popup component for the extension
 * Displays available RSS feeds for Medium articles
 */
function IndexPopup() {
  // State to store available feeds for the current page
  const [feeds, setFeeds] = useState<Feed[]>([])
  // State to track if current page is a Medium article
  const [isMediumPage, setIsMediumPage] = useState(false)

  /**
   * Effect hook to initialize the popup
   * - Checks if current tab is a Medium article
   * - Loads saved feeds from storage if available
   * - Sets up storage change listener
   */
  useEffect(() => {
    // Get the URL of the current tab
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (/-[0-9a-z]{10,}$/.test(tab.url)) {
        chrome.storage.local.get(['feeds', 'isMediumPage'], (result) => {
          if (result.feeds) setFeeds(result.feeds);
          setIsMediumPage(true);  // Directly set to true
        });
      } else {
        setIsMediumPage(false);
        setFeeds([]);
      }
    });

    // Listen for changes to the feeds in storage
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

  /**
   * Render the popup UI
   * - Shows list of available feeds if on a Medium page
   * - Shows message if not on a Medium page
   * - Includes footer with author information
   */
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