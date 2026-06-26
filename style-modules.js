// 可扩展样式模块注册表

const STYLE_MODULES = {
  codeBlock: {
    storageKeys: {
      global: 'codeBlockGlobalStyle',
      blocks: 'codeBlockStyles'
    },

    defaults: {
      titleType: 'macos',
      titleText: '代码',
      titleFontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      titleFontSize: 13,
      titleColor: '#abb2bf',
      titleBackgroundColor: '#2a2c33',
      codeBackgroundColor: '#383a42'
    },

    normalize(style = {}, baseStyle) {
      const base = baseStyle || this.defaults;
      return {
        ...this.defaults,
        ...base,
        ...style,
        titleType: style.titleType || base.titleType || this.defaults.titleType,
        titleText: style.titleText || base.titleText || this.defaults.titleText,
        titleFontSize: Number(style.titleFontSize || base.titleFontSize || this.defaults.titleFontSize) || this.defaults.titleFontSize
      };
    },

    hash(value) {
      let hash = 0;
      const text = String(value || '');
      for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
      }
      return Math.abs(hash).toString(36);
    },

    escapeHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    },

    buildTitleHtml(style) {
      if (style.titleType === 'text') {
        return `<span style="display: inline-block; color: ${style.titleColor}; font-family: ${style.titleFontFamily}; font-size: ${style.titleFontSize}px; line-height: 1.2; font-weight: 600;">${this.escapeHtml(style.titleText || this.defaults.titleText)}</span>`;
      }

      return ['#ff5f56', '#ffbd2e', '#27c93f'].map(color => (
        `<span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background-color: ${color}; margin-right: 6px; vertical-align: middle;">&nbsp;</span>`
      )).join('');
    },

    buildPreviewHtml({ codeContent, codeBlockId, lang, style }) {
      const normalizedStyle = this.normalize(style);
      const titleHtml = this.buildTitleHtml(normalizedStyle);
      const escapedLang = this.escapeHtml(lang || '');
      return `<div data-code-block-id="${codeBlockId}" data-code-lang="${escapedLang}" style="margin: 20px 0; border-radius: 8px; overflow: hidden; background: ${normalizedStyle.codeBackgroundColor}; box-shadow: 0 2px 8px rgba(0,0,0,0.15); cursor: pointer;">` +
        `<div data-code-block-title="true" style="padding: 10px 12px; background: ${normalizedStyle.titleBackgroundColor}; border-bottom: 1px solid rgba(0,0,0,0.2); line-height: 12px; min-height: 32px;">${titleHtml}</div>` +
        `<div style="padding: 16px; overflow-x: auto; background: ${normalizedStyle.codeBackgroundColor};"><code style="display: block; color: #abb2bf; font-family: 'SF Mono', Monaco, 'Cascadia Code', Consolas, monospace; font-size: 14px; line-height: 1.6; white-space: pre;">${codeContent}</code></div>` +
        `</div>`;
    },

    buildCopyNode(doc, { codeText, style }) {
      const normalizedStyle = this.normalize(style);
      const wrapper = doc.createElement('section');
      const header = doc.createElement('section');
      const pre = doc.createElement('pre');
      const code = doc.createElement('code');

      wrapper.setAttribute('style',
        'margin: 24px 0;' +
        'border-radius: 8px;' +
        'overflow: hidden;' +
        `background-color: ${normalizedStyle.codeBackgroundColor};` +
        'box-shadow: 0 2px 8px rgba(0,0,0,0.15);'
      );

      header.setAttribute('style',
        'padding: 10px 12px;' +
        `background-color: ${normalizedStyle.titleBackgroundColor};` +
        'border-bottom: 1px solid rgba(0,0,0,0.2);' +
        'line-height: 12px;' +
        'min-height: 32px;'
      );

      if (normalizedStyle.titleType === 'text') {
        const title = doc.createElement('span');
        title.textContent = normalizedStyle.titleText || this.defaults.titleText;
        title.setAttribute('style',
          'display: inline-block;' +
          `color: ${normalizedStyle.titleColor};` +
          `font-family: ${normalizedStyle.titleFontFamily};` +
          `font-size: ${normalizedStyle.titleFontSize}px;` +
          'line-height: 1.2;' +
          'font-weight: 600;'
        );
        header.appendChild(title);
      } else {
        ['#ff5f56', '#ffbd2e', '#27c93f'].forEach(color => {
          const dot = doc.createElement('span');
          dot.setAttribute('style',
            'display: inline-block;' +
            'width: 12px;' +
            'height: 12px;' +
            'border-radius: 50%;' +
            `background-color: ${color};` +
            'margin-right: 6px;' +
            'vertical-align: middle;'
          );
          dot.innerHTML = '&nbsp;';
          header.appendChild(dot);
        });
      }

      pre.setAttribute('style',
        `background-color: ${normalizedStyle.codeBackgroundColor};` +
        'padding: 0;' +
        'border-radius: 0;' +
        'overflow-x: auto;' +
        'margin: 0;'
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
      wrapper.appendChild(header);
      wrapper.appendChild(pre);
      return wrapper;
    }
  }
};
