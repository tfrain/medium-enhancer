import { useState, useEffect } from "react"

function IndexPopup() {
  const [data, setData] = useState("")

  useEffect(() => {
    // Load and execute the content script
  }, [])

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: 16,
        width: "600px",  // 整体宽度
        fontSize: "20px"  // 默认字体大小
      }}>
      <h1>
        Welcome to my <a href="https://www.plasmo.com">buttons</a> Extension!
      </h1>
      <input onChange={(e) => setData(e.target.value)} value={data} />
      <footer>Crafted by @WesleyWei</footer>
    </div>
  )
}

export default IndexPopup
