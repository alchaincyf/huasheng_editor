/**
 * 在线编辑器 - 独立页面
 * 基于 app.js 的 STYLES，复用样式系统
 */

const { createApp } = Vue;

const editorApp = createApp({
  data() {
    return {
      markdownInput: '',
      renderedContent: '',
      currentStyle: 'wechat-anthropic',
      copySuccess: false,
      starredStyles: [],
      toast: {
        show: false,
        message: '',
        type: 'success'
      },
      md: null,
      STYLES: STYLES,  // 将样式对象暴露给模板
      turndownService: null  // Turndown 服务实例
    };
  },

  async mounted() {
    // 加载星标样式
    this.loadStarredStyles();

    // 初始化 Turndown 服务（HTML 转 Markdown）
    this.initTurndownService();

    // 初始化 markdown-it
    const md = window.markdownit({
      html: true,
      linkify: true,
      typographer: true,
      highlight: function (str, lang) {
        // macOS 风格的窗口装饰
        const dots = '<div style="display: flex; align-items: center; gap: 6px; padding: 10px 12px; background: #2a2c33; border-bottom: 1px solid #1e1f24;"><span style="width: 12px; height: 12px; border-radius: 50%; background: #ff5f56;"></span><span style="width: 12px; height: 12px; border-radius: 50%; background: #ffbd2e;"></span><span style="width: 12px; height: 12px; border-radius: 50%; background: #27c93f;"></span></div>';

        // 检查 hljs 是否加载
        let codeContent = '';
        if (lang && typeof hljs !== 'undefined') {
          try {
            if (hljs.getLanguage(lang)) {
              codeContent = hljs.highlight(str, { language: lang }).value;
            } else {
              codeContent = md.utils.escapeHtml(str);
            }
          } catch (__) {
            codeContent = md.utils.escapeHtml(str);
          }
        } else {
          codeContent = md.utils.escapeHtml(str);
        }

        return `<div style="margin: 20px 0; border-radius: 8px; overflow: hidden; background: #383a42; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">${dots}<div style="padding: 16px; overflow-x: auto; background: #383a42;"><code style="display: block; color: #abb2bf; font-family: 'SF Mono', Monaco, 'Cascadia Code', Consolas, monospace; font-size: 14px; line-height: 1.6; white-space: pre;">${codeContent}</code></div></div>`;
      }
    });

    this.md = md;
  },

  watch: {
    currentStyle() {
      this.renderMarkdown();
    },
    markdownInput() {
      this.renderMarkdown();
    }
  },

  methods: {
    loadStarredStyles() {
      try {
        const saved = localStorage.getItem('starredStyles');
        if (saved) {
          this.starredStyles = JSON.parse(saved);
        }
      } catch (error) {
        console.error('加载星标样式失败:', error);
        this.starredStyles = [];
      }
    },

    handleFileUpload(event) {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        this.markdownInput = e.target.result;
      };
      reader.onerror = () => {
        this.showToast('文件读取失败', 'error');
      };
      reader.readAsText(file);

      // 清空 input，允许重复上传同一文件
      event.target.value = '';
    },

    renderMarkdown() {
      if (!this.markdownInput.trim()) {
        this.renderedContent = '';
        return;
      }

      // 预处理 Markdown
      const processedContent = this.preprocessMarkdown(this.markdownInput);

      // 渲染
      let html = this.md.render(processedContent);
      html = this.applyInlineStyles(html);
      this.renderedContent = html;
    },

    preprocessMarkdown(content) {
      // 规范化列表项格式
      content = content.replace(/^(\s*(?:\d+\.|-|\*)\s+[^:\n]+)\n\s*:\s*(.+?)$/gm, '$1: $2');
      content = content.replace(/^(\s*(?:\d+\.|-|\*)\s+.+?:)\s*\n\s+(.+?)$/gm, '$1 $2');
      content = content.replace(/^(\s*(?:\d+\.|-|\*)\s+[^:\n]+)\n:\s*(.+?)$/gm, '$1: $2');
      content = content.replace(/^(\s*(?:\d+\.|-|\*)\s+.+?)\n\n\s+(.+?)$/gm, '$1 $2');
      return content;
    },

    applyInlineStyles(html) {
      const style = STYLES[this.currentStyle].styles;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      Object.keys(style).forEach(selector => {
        if (selector === 'pre' || selector === 'code' || selector === 'pre code') {
          return;
        }

        const elements = doc.querySelectorAll(selector);
        elements.forEach(el => {
          const currentStyle = el.getAttribute('style') || '';
          el.setAttribute('style', currentStyle + '; ' + style[selector]);
        });
      });

      // 处理图片网格布局
      this.groupConsecutiveImages(doc);

      const container = doc.createElement('div');
      container.setAttribute('style', style.container);
      container.innerHTML = doc.body.innerHTML;

      return container.outerHTML;
    },

    groupConsecutiveImages(doc) {
      const body = doc.body;
      const children = Array.from(body.children);

      let imagesToProcess = [];

      // 找出所有连续的图片元素
      children.forEach((child, index) => {
        if (child.tagName === 'P' && child.children.length === 1 && child.children[0].tagName === 'IMG') {
          // 段落中只包含图片
          imagesToProcess.push({ element: child, img: child.children[0], index });
        } else if (child.tagName === 'IMG') {
          // 直接是图片元素
          imagesToProcess.push({ element: child, img: child, index });
        }
      });

      // 按索引分组连续的图片
      let groups = [];
      let currentGroup = [];

      imagesToProcess.forEach((item, i) => {
        if (i === 0) {
          currentGroup.push(item);
        } else {
          // 检查是否连续（索引差值为1或之间只有空白节点）
          const prevIndex = imagesToProcess[i - 1].index;
          const currIndex = item.index;
          const isContinuous = currIndex - prevIndex <= 2; // 允许之间有一个空白节点

          if (isContinuous) {
            currentGroup.push(item);
          } else {
            if (currentGroup.length > 0) {
              groups.push([...currentGroup]);
            }
            currentGroup = [item];
          }
        }
      });

      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }

      // 对每组图片进行处理
      groups.forEach(group => {
        // 只有2张及以上的图片才需要网格布局
        if (group.length < 2) return;

        const imageCount = group.length;
        const firstElement = group[0].element;

        // 创建网格容器
        const gridContainer = doc.createElement('div');
        gridContainer.setAttribute('class', 'image-grid');

        // 根据图片数量决定列数
        let columns;
        if (imageCount === 2) {
          columns = 2;
        } else if (imageCount === 3) {
          columns = 3;
        } else if (imageCount === 4) {
          columns = 2;
        } else {
          columns = 3;
        }

        // 设置网格容器样式
        gridContainer.setAttribute('style', `
          display: grid;
          grid-template-columns: repeat(${columns}, 1fr);
          gap: 8px;
          margin: 20px auto;
          max-width: 100%;
        `.trim());

        // 将图片添加到网格容器中
        group.forEach(item => {
          const imgWrapper = doc.createElement('div');
          imgWrapper.setAttribute('style', `
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: #f5f5f5;
            border-radius: 4px;
            overflow: hidden;
            min-height: 120px;
            max-height: 360px;
          `.trim());

          const img = item.img.cloneNode(true);
          // 修改图片样式以适应网格
          img.setAttribute('style', `
            width: 100%;
            height: 100%;
            object-fit: contain;
            border-radius: 4px;
          `.trim());

          imgWrapper.appendChild(img);
          gridContainer.appendChild(imgWrapper);
        });

        // 替换原来的图片元素
        firstElement.parentNode.insertBefore(gridContainer, firstElement);

        // 删除原来的图片元素
        group.forEach(item => {
          item.element.parentNode.removeChild(item.element);
        });
      });
    },

    convertGridToTable(doc) {
      // 找到所有的图片网格容器
      const imageGrids = doc.querySelectorAll('.image-grid');

      imageGrids.forEach(grid => {
        // 获取网格的列数（从 grid-template-columns 样式中提取）
        const gridStyle = grid.getAttribute('style') || '';
        const columnsMatch = gridStyle.match(/grid-template-columns:\s*repeat\((\d+),/);
        const columns = columnsMatch ? parseInt(columnsMatch[1]) : 3;


        // 获取所有图片包装器
        const imgWrappers = Array.from(grid.children);

        // 创建 table 元素
        const table = doc.createElement('table');
        table.setAttribute('style', `
          width: 100% !important;
          border-collapse: collapse !important;
          margin: 20px auto !important;
          table-layout: fixed !important;
          border: none !important;
          background: transparent !important;
        `.trim());

        // 计算需要多少行
        const rows = Math.ceil(imgWrappers.length / columns);

        // 创建表格行
        for (let i = 0; i < rows; i++) {
          const tr = doc.createElement('tr');

          // 创建表格单元格
          for (let j = 0; j < columns; j++) {
            const index = i * columns + j;
            const td = doc.createElement('td');

            td.setAttribute('style', `
              padding: 4px !important;
              vertical-align: top !important;
              width: ${100 / columns}% !important;
              border: none !important;
              background: transparent !important;
            `.trim());

            // 如果有对应的图片，添加到单元格
            if (index < imgWrappers.length) {
              const imgWrapper = imgWrappers[index];
              const img = imgWrapper.querySelector('img');

              if (img) {
                // 根据列数设置不同的图片最大高度 - 确保单行最高360px
                let imgMaxHeight;
                let containerHeight;
                if (columns === 2) {
                  imgMaxHeight = '340px';  // 2列布局单张最高340px（留出padding空间）
                  containerHeight = '360px';  // 容器高度360px
                } else if (columns === 3) {
                  imgMaxHeight = '340px';  // 3列布局单张最高340px
                  containerHeight = '360px';  // 容器高度360px
                } else {
                  imgMaxHeight = '340px';  // 默认高度340px
                  containerHeight = '360px';  // 容器高度360px
                }

                // 创建一个新的包装 div - 添加背景和居中样式（使用table-cell方式，更兼容）
                const wrapper = doc.createElement('div');
                wrapper.setAttribute('style', `
                  width: 100% !important;
                  height: ${containerHeight} !important;
                  text-align: center !important;
                  background-color: #f5f5f5 !important;
                  border-radius: 4px !important;
                  padding: 10px !important;
                  box-sizing: border-box !important;
                  overflow: hidden !important;
                  display: table !important;
                `.trim());

                // 创建内部居中容器
                const innerWrapper = doc.createElement('div');
                innerWrapper.setAttribute('style', `
                  display: table-cell !important;
                  vertical-align: middle !important;
                  text-align: center !important;
                `.trim());

                // 克隆图片并直接设置最大高度
                const newImg = img.cloneNode(true);
                newImg.setAttribute('style', `
                  max-width: calc(100% - 20px) !important;
                  max-height: ${imgMaxHeight} !important;
                  width: auto !important;
                  height: auto !important;
                  display: inline-block !important;
                  margin: 0 auto !important;
                  border-radius: 4px !important;
                  object-fit: contain !important;
                `.trim());

                innerWrapper.appendChild(newImg);
                wrapper.appendChild(innerWrapper);
                td.appendChild(wrapper);
              }
            }

            tr.appendChild(td);
          }

          table.appendChild(tr);
        }

        // 替换网格为 table
        grid.parentNode.replaceChild(table, grid);
      });
    },

    async copyToClipboard() {
      if (!this.renderedContent) {
        this.showToast('没有内容可复制', 'error');
        return;
      }

      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(this.renderedContent, 'text/html');

        // 将图片网格转换为 table 布局（公众号兼容）
        this.convertGridToTable(doc);

        // 处理图片：转为 Base64
        const images = doc.querySelectorAll('img');
        if (images.length > 0) {
          this.showToast(`正在处理 ${images.length} 张图片...`, 'success');

          let successCount = 0;
          let failCount = 0;

          const imagePromises = Array.from(images).map(async (img) => {
            try {
              const base64 = await this.convertImageToBase64(img);
              img.setAttribute('src', base64);
              successCount++;
            } catch (error) {
              console.error('图片转换失败:', img.getAttribute('src'), error);
              failCount++;
              // 失败时保持原URL
            }
          });

          await Promise.all(imagePromises);

          if (failCount > 0) {
            this.showToast(`图片处理完成：${successCount} 成功，${failCount} 失败（保留原链接）`, 'error');
          }
        }

        // Section 容器包裹
        const styleConfig = STYLES[this.currentStyle];
        const containerBg = this.extractBackgroundColor(styleConfig.styles.container);

        if (containerBg && containerBg !== '#fff' && containerBg !== '#ffffff') {
          const section = doc.createElement('section');
          const containerStyle = styleConfig.styles.container;
          const paddingMatch = containerStyle.match(/padding:\s*([^;]+)/);
          const maxWidthMatch = containerStyle.match(/max-width:\s*([^;]+)/);
          const padding = paddingMatch ? paddingMatch[1].trim() : '40px 20px';
          const maxWidth = maxWidthMatch ? maxWidthMatch[1].trim() : '100%';

          section.setAttribute('style',
            `background-color: ${containerBg}; ` +
            `padding: ${padding}; ` +
            `max-width: ${maxWidth}; ` +
            `margin: 0 auto; ` +
            `box-sizing: border-box; ` +
            `word-wrap: break-word;`
          );

          while (doc.body.firstChild) {
            section.appendChild(doc.body.firstChild);
          }

          const allElements = section.querySelectorAll('*');
          allElements.forEach(el => {
            const currentStyle = el.getAttribute('style') || '';
            let newStyle = currentStyle;
            newStyle = newStyle.replace(/max-width:\s*[^;]+;?/g, '');
            newStyle = newStyle.replace(/margin:\s*0\s+auto;?/g, '');
            if (newStyle.includes(`background-color: ${containerBg}`)) {
              newStyle = newStyle.replace(new RegExp(`background-color:\\s*${containerBg.replace(/[()]/g, '\\$&')};?`, 'g'), '');
            }
            newStyle = newStyle.replace(/;\s*;/g, ';').replace(/^\s*;\s*|\s*;\s*$/g, '').trim();
            if (newStyle) {
              el.setAttribute('style', newStyle);
            } else {
              el.removeAttribute('style');
            }
          });

          doc.body.appendChild(section);
        }

        // 代码块简化
        const codeBlocks = doc.querySelectorAll('div[style*="border-radius: 8px"]');
        codeBlocks.forEach(block => {
          const codeElement = block.querySelector('code');
          if (codeElement) {
            const codeText = codeElement.textContent || codeElement.innerText;
            const pre = doc.createElement('pre');
            const code = doc.createElement('code');

            pre.setAttribute('style',
              'background: linear-gradient(to bottom, #2a2c33 0%, #383a42 8px, #383a42 100%);' +
              'padding: 0;' +
              'border-radius: 6px;' +
              'overflow: hidden;' +
              'margin: 24px 0;' +
              'box-shadow: 0 2px 8px rgba(0,0,0,0.15);'
            );

            code.setAttribute('style',
              'color: #abb2bf;' +
              'font-family: "SF Mono", Consolas, Monaco, "Courier New", monospace;' +
              'font-size: 14px;' +
              'line-height: 1.7;' +
              'display: block;' +
              'white-space: pre;' +
              'padding: 16px 20px;' +
              '-webkit-font-smoothing: antialiased;' +
              '-moz-osx-font-smoothing: grayscale;'
            );

            code.textContent = codeText;
            pre.appendChild(code);
            block.parentNode.replaceChild(pre, block);
          }
        });

        // 列表项扁平化
        const listItems = doc.querySelectorAll('li');
        listItems.forEach(li => {
          let text = li.textContent || li.innerText;
          text = text.replace(/\n/g, ' ').replace(/\r/g, ' ').replace(/\s+/g, ' ').trim();
          li.innerHTML = '';
          li.textContent = text;
          const currentStyle = li.getAttribute('style') || '';
          li.setAttribute('style', currentStyle);
        });

        const simplifiedHTML = doc.body.innerHTML;
        const plainText = doc.body.textContent || '';

        const htmlBlob = new Blob([simplifiedHTML], { type: 'text/html' });
        const textBlob = new Blob([plainText], { type: 'text/plain' });

        const clipboardItem = new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob
        });

        await navigator.clipboard.write([clipboardItem]);

        this.copySuccess = true;
        this.showToast('复制成功', 'success');

        setTimeout(() => {
          this.copySuccess = false;
        }, 2000);
      } catch (error) {
        console.error('复制失败:', error);
        this.showToast('复制失败', 'error');
      }
    },

    async convertImageToBase64(imgElement) {
      const src = imgElement.getAttribute('src');

      // 如果已经是Base64，直接返回
      if (src.startsWith('data:')) {
        return src;
      }

      // 尝试转换为Base64
      try {
        const response = await fetch(src, {
          mode: 'cors',
          cache: 'default'
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const blob = await response.blob();

        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = (error) => reject(new Error('FileReader failed: ' + error));
          reader.readAsDataURL(blob);
        });
      } catch (error) {
        // CORS或网络错误时，抛出错误让外层处理
        throw new Error(`图片加载失败 (${src}): ${error.message}`);
      }
    },

    extractBackgroundColor(styleString) {
      if (!styleString) return null;

      const bgColorMatch = styleString.match(/background-color:\s*([^;]+)/);
      if (bgColorMatch) {
        return bgColorMatch[1].trim();
      }

      const bgMatch = styleString.match(/background:\s*([#rgb][^;]+)/);
      if (bgMatch) {
        const bgValue = bgMatch[1].trim();
        if (bgValue.startsWith('#') || bgValue.startsWith('rgb')) {
          return bgValue;
        }
      }

      return null;
    },

    isStyleStarred(styleKey) {
      return this.starredStyles.includes(styleKey);
    },

    isRecommended(styleKey) {
      // 推荐的样式
      const recommended = ['wechat-anthropic', 'wechat-ft', 'wechat-nyt', 'wechat-tech'];
      return recommended.includes(styleKey);
    },

    toggleStarStyle(styleKey) {
      const index = this.starredStyles.indexOf(styleKey);
      if (index > -1) {
        this.starredStyles.splice(index, 1);
        this.showToast('已取消收藏', 'success');
      } else {
        this.starredStyles.push(styleKey);
        this.showToast('已收藏样式', 'success');
      }
      this.saveStarredStyles();
    },

    saveStarredStyles() {
      try {
        localStorage.setItem('starredStyles', JSON.stringify(this.starredStyles));
      } catch (error) {
        console.error('保存星标样式失败:', error);
      }
    },

    getStyleName(styleKey) {
      const style = STYLES[styleKey];
      return style ? style.name : styleKey;
    },

    showToast(message, type = 'success') {
      this.toast.show = true;
      this.toast.message = message;
      this.toast.type = type;

      setTimeout(() => {
        this.toast.show = false;
      }, 3000);
    },

    // 初始化 Turndown 服务
    initTurndownService() {
      if (typeof TurndownService === 'undefined') {
        console.warn('Turndown 库未加载，智能粘贴功能将不可用');
        return;
      }

      this.turndownService = new TurndownService({
        headingStyle: 'atx',        // 使用 # 样式的标题
        bulletListMarker: '-',       // 无序列表使用 -
        codeBlockStyle: 'fenced',    // 代码块使用 ```
        fence: '```',                // 代码块围栏
        emDelimiter: '*',            // 斜体使用 *
        strongDelimiter: '**',       // 加粗使用 **
        linkStyle: 'inlined'         // 链接使用内联样式
      });

      // 配置表格支持
      this.turndownService.keep(['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td']);

      // 自定义规则：保留表格结构
      this.turndownService.addRule('table', {
        filter: 'table',
        replacement: (_content, node) => {
          // 简单的表格转换为 Markdown 表格
          const rows = Array.from(node.querySelectorAll('tr'));
          if (rows.length === 0) return '';

          let markdown = '\n\n';
          let headerProcessed = false;

          rows.forEach((row, index) => {
            const cells = Array.from(row.querySelectorAll('td, th'));
            const cellContents = cells.map(cell => {
              // 清理单元格内容
              const text = cell.textContent.replace(/\n/g, ' ').trim();
              return text;
            });

            if (cellContents.length > 0) {
              markdown += '| ' + cellContents.join(' | ') + ' |\n';

              // 第一行后添加分隔符
              if (index === 0 || (!headerProcessed && row.querySelector('th'))) {
                markdown += '| ' + cells.map(() => '---').join(' | ') + ' |\n';
                headerProcessed = true;
              }
            }
          });

          return markdown + '\n';
        }
      });

      // 自定义规则：优化图片处理
      this.turndownService.addRule('image', {
        filter: 'img',
        replacement: (_content, node) => {
          const alt = node.alt || '图片';
          const src = node.src || '';
          const title = node.title || '';

          // 处理 base64 图片（截取前30个字符作为标识）
          if (src.startsWith('data:image')) {
            const type = src.match(/data:image\/(\w+);/)?.[1] || 'image';
            return `![${alt}](data:image/${type};base64,...)${title ? ` "${title}"` : ''}\n`;
          }

          return `![${alt}](${src})${title ? ` "${title}"` : ''}\n`;
        }
      });
    },

    // 处理粘贴事件
    handleSmartPaste(event) {
      const clipboardData = event.clipboardData || event.originalEvent?.clipboardData;

      if (!clipboardData) {
        return; // 不支持的浏览器，使用默认行为
      }

      // 获取剪贴板中的各种格式数据
      const htmlData = clipboardData.getData('text/html');
      const textData = clipboardData.getData('text/plain');

      // 如果有 HTML 数据，说明可能来自富文本编辑器（如飞书、Notion、Word）
      if (htmlData && htmlData.trim() !== '' && this.turndownService) {
        event.preventDefault(); // 阻止默认粘贴

        try {
          // 将 HTML 转换为 Markdown
          let markdown = this.turndownService.turndown(htmlData);

          // 清理多余的空行
          markdown = markdown.replace(/\n{3,}/g, '\n\n');

          // 获取当前光标位置
          const textarea = event.target;
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const value = textarea.value;

          // 插入转换后的 Markdown
          const newValue = value.substring(0, start) + markdown + value.substring(end);

          // 更新文本框内容
          this.markdownInput = newValue;

          // 恢复光标位置
          this.$nextTick(() => {
            textarea.selectionStart = textarea.selectionEnd = start + markdown.length;
            textarea.focus();
          });

          // 显示提示
          this.showToast('✨ 已智能转换为 Markdown 格式', 'success');
        } catch (error) {
          console.error('HTML 转 Markdown 失败:', error);
          // 转换失败，使用纯文本
          this.insertTextAtCursor(event.target, textData);
        }
      }
      // 检测是否已经是 Markdown 格式
      else if (textData && this.isMarkdown(textData)) {
        // 已经是 Markdown，直接粘贴
        return; // 使用默认行为
      }
      // 普通文本，使用默认粘贴行为
      else {
        return; // 使用默认行为
      }
    },

    // 检测文本是否为 Markdown 格式
    isMarkdown(text) {
      if (!text) return false;

      // Markdown 特征模式
      const patterns = [
        /^#{1,6}\s+/m,           // 标题
        /\*\*[^*]+\*\*/,         // 加粗
        /\*[^*\n]+\*/,           // 斜体
        /\[[^\]]+\]\([^)]+\)/,   // 链接
        /!\[[^\]]*\]\([^)]+\)/,  // 图片
        /^[\*\-\+]\s+/m,         // 无序列表
        /^\d+\.\s+/m,            // 有序列表
        /^>\s+/m,                // 引用
        /`[^`]+`/,               // 内联代码
        /```[\s\S]*?```/,        // 代码块
        /^\|.*\|$/m              // 表格
      ];

      // 计算匹配的特征数量
      const matchCount = patterns.filter(pattern => pattern.test(text)).length;

      // 如果有 2 个或以上的 Markdown 特征，认为是 Markdown
      return matchCount >= 2;
    },

    // 在光标位置插入文本
    insertTextAtCursor(textarea, text) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;

      const newValue = value.substring(0, start) + text + value.substring(end);
      this.markdownInput = newValue;

      this.$nextTick(() => {
        textarea.selectionStart = textarea.selectionEnd = start + text.length;
        textarea.focus();
      });
    }
  }
});

editorApp.mount('#app');
