
这几个文件分别有什么用？
manifest是如何生成出来的？怎么确定要运行到对应的文件夹下的文件？

backgroud.js 应该是一开始这个插件的定义，及背后运行的逻辑


# wwtd 问题
bug:
- medium 的目录有些问题（P0）如何精准的匹配h1 和 h2目录呢？
- extract.ts 改为medium的内容目录就会无法展示（P1）
- 集成RSS（参考rss仓库）
- medium主页不进行目录检测，不展示无目录提示
- 为什么提示语句总会提示没有之后又展示目录？
- 如果在medium.com首次刷新，再次进入文章中会导致不会展示目录；如果在文章中刷新，那么进入medium.com 还是会展示目录
- 缓存问题，原插件貌似没有error出现，而新插件过一会就要重新加载\

feat:
- 无rss：https://medium.com/@byteshiva/passing-structs-by-value-vs-by-reference-in-go-1487b74d3e1a 
- toc 一直在滚动：https://medium.com/thedeephub/rust-a-new-titan-in-data-science-d449463078b2