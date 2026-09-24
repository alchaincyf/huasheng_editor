# vendor/ 第三方库自建说明

这两个文件是从 CDN 搬到同源自建的（性能优化第 2 步，见项目根目录的
`实验日志.md`）。版本号跟线上 `master` 分支当时用的版本**完全一致**，只是换了
托管位置，没有升级/降级任何版本。以后要升级版本时手动重新下载 + 更新这份
README，这个项目没有引入构建流程。

| 文件 | 版本 | 来源 URL（下载时用的这个） |
|---|---|---|
| `markdown-it.min.js` | 14.0.0 | `https://cdn.jsdelivr.net/npm/markdown-it@14.0.0/dist/markdown-it.min.js` |
| `vue.global.prod.js` | 3.4.15 | `https://cdn.jsdelivr.net/npm/vue@3.4.15/dist/vue.global.prod.js` |

## highlight.js 的 CSS + JS 没有出现在这里——不是漏掉，是删掉了

线上 `index.html` 原来这两行：

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/atom-one-dark.min.css">
<script src="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/es/highlight.min.js"></script>
```

想把 JS 那个也搬到本地自建时，先 `curl` 了一下这个 URL，结果是 **404**
（`Couldn't find the requested file /es/highlight.min.js in highlight.js.`）
——highlight.js v11 的 npm 包结构变了，`/es/` 目录下已经没有一个打包好的
`highlight.min.js`（那里是给 ES module `import` 用的分文件）。也试过
`/lib/common.min.js`（这个文件存在），但它是 CommonJS 格式
（`require`/`module.exports`），直接当 `<script src>` 加载在浏览器里会报
`require is not defined`，一样跑不起来。

也就是说：**这个脚本标签从上线起就是 404，`hljs` 全局变量从来没被定义过**。
翻了一遍 `app.js` 里唯一用到 `hljs` 的地方（`highlight` 回调，约第 677 行）：

```js
if (lang && typeof hljs !== 'undefined') {
  ...(用 hljs.highlight 做语法高亮)...
} else {
  codeContent = md.utils.escapeHtml(str);   // 一直走的是这条
}
```

`typeof hljs !== 'undefined'` 这层判断本来就是给"库没加载"兜底的，所以代码
从来没崩过，只是代码块从来没有真正被语法高亮，一直是纯转义文本。配套的那个
CSS 文件（`atom-one-dark.min.css`）里全是 `.hljs`/`.hljs-keyword` 这类 class
选择器，既然渲染出的 HTML 里从来没出现过这些 class，这个 CSS 文件对最终页面
样式也是零贡献。

两个文件目前对渲染结果**零贡献**，所以这次直接把这两行 `<link>`/`<script>`
从 `index.html` 里删掉了，省下两个请求（其中一个原本还是白白 404 一次）。
**没有**换成一份「修好的」能真正工作的 highlight.js——那样会让代码块突然真的
开始被语法高亮，改变预览区渲染出的 HTML，超出这轮「首屏提速、不改可见效果」
的授权范围（黄金测试要求优化前后 HTML 逐字节一致），所以留白，交给花叔单独
决定要不要修、修的话用哪个正确的构建（已经确认能用的是
`https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js`，
是标准的 `var hljs = function(){...}()` 全局变量写法，本地验证过能正常定义
`window.hljs`）。
