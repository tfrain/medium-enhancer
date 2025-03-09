
这几个文件分别有什么用？
manifest是如何生成出来的？怎么确定要运行到对应的文件夹下的文件？

backgroud.js 应该是一开始这个插件的定义，及背后运行的逻辑


# wwtd 问题，feat也要注意
bug:
- 如果在medium.com首次刷新，再次进入文章中会导致不会展示目录；如果在文章中刷新，那么进入medium.com 还是会展示目录
- 缓存问题，原插件貌似没有error出现，而新插件过一会就要重新加载\

feat:
- 多出来public的出版物了：https://medium.com/@byteshiva/passing-structs-by-value-vs-by-reference-in-go-1487b74d3e1a 
- toc 一直在滚动（无影响了）：https://medium.com/thedeephub/rust-a-new-titan-in-data-science-d449463078b2