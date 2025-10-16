/**
 * 在线编辑器 - 独立页面
 * 基于 app.js 的 STYLES，复用样式系统
 */

/**
 * 图片存储管理器 - 使用 IndexedDB 持久化存储压缩后的图片
 */
class ImageStore {
  constructor() {
    this.dbName = 'WechatEditorImages';
    this.storeName = 'images';
    this.version = 1;
    this.db = null;
  }

  // 初始化 IndexedDB
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        console.error('IndexedDB 打开失败:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB 初始化成功');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 创建对象存储（如果不存在）
        if (!db.objectStoreNames.contains(this.storeName)) {
          const objectStore = db.createObjectStore(this.storeName, { keyPath: 'id' });

          // 创建索引
          objectStore.createIndex('createdAt', 'createdAt', { unique: false });
          objectStore.createIndex('name', 'name', { unique: false });

          console.log('ImageStore 对象存储已创建');
        }
      };
    });
  }

  // 保存图片
  async saveImage(id, blob, metadata = {}) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const objectStore = transaction.objectStore(this.storeName);

      const imageData = {
        id: id,
        blob: blob,
        name: metadata.name || 'image',
        originalSize: metadata.originalSize || 0,
        compressedSize: blob.size,
        createdAt: Date.now(),
        ...metadata
      };

      const request = objectStore.put(imageData);

      request.onsuccess = () => {
        console.log(`图片已保存: ${id}`);
        resolve(id);
      };

      request.onerror = () => {
        console.error('保存图片失败:', request.error);
        reject(request.error);
      };
    });
  }

  // 获取图片（返回 Object URL）
  async getImage(id) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.get(id);

      request.onsuccess = () => {
        const result = request.result;
        if (result && result.blob) {
          const objectURL = URL.createObjectURL(result.blob);
          resolve(objectURL);
        } else {
          console.warn(`图片不存在: ${id}`);
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error('读取图片失败:', request.error);
        reject(request.error);
      };
    });
  }

  // 获取图片 Blob（用于复制时转 Base64）
  async getImageBlob(id) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.get(id);

      request.onsuccess = () => {
        const result = request.result;
        if (result && result.blob) {
          resolve(result.blob);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error('读取图片 Blob 失败:', request.error);
        reject(request.error);
      };
    });
  }

  // 删除图片
  async deleteImage(id) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.delete(id);

      request.onsuccess = () => {
        console.log(`图片已删除: ${id}`);
        resolve();
      };

      request.onerror = () => {
        console.error('删除图片失败:', request.error);
        reject(request.error);
      };
    });
  }

  // 获取所有图片列表（用于管理）
  async getAllImages() {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error('获取图片列表失败:', request.error);
        reject(request.error);
      };
    });
  }

  // 清空所有图片
  async clearAll() {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.clear();

      request.onsuccess = () => {
        console.log('所有图片已清空');
        resolve();
      };

      request.onerror = () => {
        console.error('清空图片失败:', request.error);
        reject(request.error);
      };
    });
  }

  // 计算总存储大小
  async getTotalSize() {
    const images = await this.getAllImages();
    return images.reduce((total, img) => total + (img.compressedSize || 0), 0);
  }
}

/**
 * 图片压缩器 - 使用 Canvas API 压缩图片
 */
class ImageCompressor {
  constructor(options = {}) {
    this.maxWidth = options.maxWidth || 1920;
    this.maxHeight = options.maxHeight || 1920;
    this.quality = options.quality || 0.85;
    this.mimeType = options.mimeType || 'image/jpeg';
  }

  // 压缩图片
  async compress(file) {
    return new Promise((resolve, reject) => {
      // 如果是 GIF 或 SVG，不压缩（保持动画或矢量）
      if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
        resolve(file);
        return;
      }

      const reader = new FileReader();

      reader.onerror = () => {
        reject(new Error('文件读取失败'));
      };

      reader.onload = (e) => {
        const img = new Image();

        img.onerror = () => {
          reject(new Error('图片加载失败'));
        };

        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // 计算缩放比例
            let scale = 1;
            if (width > this.maxWidth) {
              scale = this.maxWidth / width;
            }
            if (height > this.maxHeight) {
              scale = Math.min(scale, this.maxHeight / height);
            }

            // 应用缩放
            width = Math.floor(width * scale);
            height = Math.floor(height * scale);

            canvas.width = width;
            canvas.height = height;

            // 绘制图片
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff'; // 白色背景（针对透明 PNG）
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            // 转为 Blob
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  // 如果压缩后反而更大，使用原文件
                  if (blob.size < file.size) {
                    resolve(blob);
                  } else {
                    console.log('压缩后体积更大，使用原文件');
                    resolve(file);
                  }
                } else {
                  reject(new Error('Canvas toBlob 失败'));
                }
              },
              // PNG 保持 PNG，其他转 JPEG
              file.type === 'image/png' ? 'image/png' : this.mimeType,
              this.quality
            );
          } catch (error) {
            reject(error);
          }
        };

        img.src = e.target.result;
      };

      reader.readAsDataURL(file);
    });
  }

  // 格式化文件大小
  static formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}

/**
 * 图床管理器 - 支持多个图床服务，智能降级
 */
class ImageHostManager {
  constructor() {
    // 图床服务列表（仅保留可靠且无CORS限制的服务）
    this.hosts = [
      {
        name: 'SM.MS',
        upload: this.uploadToSmms.bind(this),
        maxSize: 5 * 1024 * 1024, // 5MB
        priority: 1,
        timeout: 10000 // 10秒超时
      }
    ];

    // 失败记录（用于临时降低优先级）
    this.failureCount = {};
    this.lastFailureTime = {};

    // 启用/禁用状态（可以手动禁用某些服务）
    this.disabledHosts = new Set();
  }

  // 智能选择图床（根据失败记录和文件大小）
  selectHost(fileSize) {
    const now = Date.now();
    const cooldownTime = 3 * 60 * 1000; // 3分钟冷却时间（缩短以便更快重试）

    return this.hosts
      .filter(host => {
        // 过滤条件：1) 文件大小符合 2) 未被禁用 3) 不在冷却期或失败次数不太多
        if (fileSize > host.maxSize) return false;
        if (this.disabledHosts.has(host.name)) return false;

        const failures = this.failureCount[host.name] || 0;
        const lastFail = this.lastFailureTime[host.name] || 0;
        const inCooldown = (now - lastFail) < cooldownTime;

        // 如果失败次数超过3次且在冷却期内，跳过
        if (failures >= 3 && inCooldown) return false;

        return true;
      })
      .sort((a, b) => {
        // 如果最近失败过，降低优先级
        const aFailures = this.failureCount[a.name] || 0;
        const bFailures = this.failureCount[b.name] || 0;
        const aLastFail = this.lastFailureTime[a.name] || 0;
        const bLastFail = this.lastFailureTime[b.name] || 0;

        // 如果在冷却期内，大幅降低优先级
        const aInCooldown = (now - aLastFail) < cooldownTime;
        const bInCooldown = (now - bLastFail) < cooldownTime;

        if (aInCooldown && !bInCooldown) return 1;
        if (!aInCooldown && bInCooldown) return -1;

        // 按失败次数和原始优先级排序
        const aPenalty = aFailures * 5 + a.priority;
        const bPenalty = bFailures * 5 + b.priority;

        return aPenalty - bPenalty;
      });
  }

  // 记录失败
  recordFailure(hostName) {
    this.failureCount[hostName] = (this.failureCount[hostName] || 0) + 1;
    this.lastFailureTime[hostName] = Date.now();
  }

  // 记录成功（重置失败计数）
  recordSuccess(hostName) {
    this.failureCount[hostName] = 0;
    delete this.lastFailureTime[hostName];
  }

  // 尝试上传到所有可用图床
  async upload(file, onProgress) {
    const availableHosts = this.selectHost(file.size);

    if (availableHosts.length === 0) {
      throw new Error('没有可用的图床服务（文件可能太大或所有服务都在冷却期）');
    }

    let lastError = null;
    let attemptCount = 0;

    for (const host of availableHosts) {
      attemptCount++;
      try {
        if (onProgress) {
          onProgress(`🔄 尝试 ${host.name} (${attemptCount}/${availableHosts.length})`);
        }

        // 使用Promise.race实现超时控制
        const uploadPromise = host.upload(file);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('上传超时')), host.timeout);
        });

        const result = await Promise.race([uploadPromise, timeoutPromise]);
        this.recordSuccess(host.name);

        if (onProgress) {
          onProgress(`✅ ${host.name} 上传成功`);
        }

        return {
          url: result.url,
          host: host.name,
          deleteUrl: result.deleteUrl
        };
      } catch (error) {
        const errorMsg = error.message || error.toString();
        console.warn(`${host.name} 上传失败:`, errorMsg);
        this.recordFailure(host.name);
        lastError = error;

        // 如果还有其他图床可以尝试，继续
        if (attemptCount < availableHosts.length && onProgress) {
          onProgress(`⚠️ ${host.name} 失败，尝试下一个...`);
        }
      }
    }

    // 所有图床都失败了
    throw new Error(`所有图床均上传失败 (尝试了${attemptCount}个)\n最后错误: ${lastError?.message || '未知错误'}`);
  }

  // SM.MS 图床（唯一支持浏览器端直接上传的稳定图床）
  async uploadToSmms(file) {
    const formData = new FormData();
    formData.append('smfile', file);

    const response = await fetch('https://sm.ms/api/v2/upload', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.success || (result.code === 'image_repeated' && result.images)) {
      return {
        url: result.data?.url || result.images,
        deleteUrl: result.data?.delete || null
      };
    }

    throw new Error(result.message || 'SM.MS响应失败');
  }

  // 辅助：文件转 Base64
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  }
}

const { createApp } = Vue;

const editorApp = createApp({
  data() {
    return {
      markdownInput: '',
      renderedContent: '',
      currentStyle: 'wechat-default',
      copySuccess: false,
      starredStyles: [],
      toast: {
        show: false,
        message: '',
        type: 'success'
      },
      md: null,
      STYLES: STYLES,  // 将样式对象暴露给模板
      turndownService: null,  // Turndown 服务实例
      isDraggingOver: false,  // 拖拽状态
      imageHostManager: new ImageHostManager(),  // 图床管理器（已废弃，保留兼容）
      imageStore: null,  // 图片存储管理器（IndexedDB）
      imageCompressor: null,  // 图片压缩器
      imageIdToObjectURL: {},  // 图片 ID 到 Object URL 的映射（用于预览时替换）
      // 小红书相关
      previewMode: 'wechat',  // 预览模式：'wechat' 或 'xiaohongshu'
      xiaohongshuImages: [],  // 生成的小红书图片数组
      xiaohongshuGenerating: false  // 是否正在生成小红书图片
    };
  },

  async mounted() {
    // 加载星标样式
    this.loadStarredStyles();

    // 加载用户偏好设置
    this.loadUserPreferences();

    // 初始化图片存储管理器
    this.imageStore = new ImageStore();
    try {
      await this.imageStore.init();
      console.log('图片存储系统已就绪');
    } catch (error) {
      console.error('图片存储系统初始化失败:', error);
      this.showToast('图片存储系统初始化失败', 'error');
    }

    // 初始化图片压缩器（最大宽度 1920px，质量 85%）
    this.imageCompressor = new ImageCompressor({
      maxWidth: 1920,
      maxHeight: 1920,
      quality: 0.85
    });

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

    // 手动触发一次渲染（确保初始内容显示）
    this.$nextTick(() => {
      this.renderMarkdown();
    });
  },

  watch: {
    currentStyle() {
      if (this.md) {
        this.renderMarkdown();
      }
      // 保存样式偏好
      this.saveUserPreferences();
    },
    markdownInput() {
      if (this.md) {
        this.renderMarkdown();
      }
      // 自动保存内容（防抖）
      clearTimeout(this._saveTimeout);
      this._saveTimeout = setTimeout(() => {
        this.saveUserPreferences();
      }, 1000); // 1秒后保存
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

    // 加载用户偏好设置（样式和内容）
    loadUserPreferences() {
      try {
        // 加载样式偏好
        const savedStyle = localStorage.getItem('currentStyle');
        if (savedStyle && STYLES[savedStyle]) {
          this.currentStyle = savedStyle;
        }

        // 加载上次的内容
        const savedContent = localStorage.getItem('markdownInput');
        if (savedContent) {
          this.markdownInput = savedContent;
        } else {
          // 如果没有保存的内容，加载默认示例
          this.loadDefaultExample();
        }
      } catch (error) {
        console.error('加载用户偏好失败:', error);
        // 加载失败时使用默认示例
        this.loadDefaultExample();
      }
    },

    // 保存用户偏好设置
    saveUserPreferences() {
      try {
        // 保存当前样式
        localStorage.setItem('currentStyle', this.currentStyle);

        // 保存当前内容
        localStorage.setItem('markdownInput', this.markdownInput);
      } catch (error) {
        console.error('保存用户偏好失败:', error);
      }
    },

    // 加载默认示例文章
    loadDefaultExample() {
      this.markdownInput = `![](https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?w=1200&h=400&fit=crop)

# 公众号 Markdown 编辑器

欢迎使用这款专为**微信公众号**设计的 Markdown 编辑器！✨

## 🎯 核心功能

### 1. 智能图片处理

![](https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?w=800&h=500&fit=crop)

- **粘贴即用**：支持从任何地方复制粘贴图片（截图、浏览器、文件管理器）
- **自动压缩**：图片自动压缩，平均压缩 50%-80%
- **本地存储**：使用 IndexedDB 持久化，刷新不丢失
- **编辑流畅**：编辑器中使用短链接，告别卡顿

### 2. 多图排版展示

支持朋友圈式的多图网格布局，2-3 列自动排版：

![](https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=600&h=400&fit=crop)
![](https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600&h=400&fit=crop)
![](https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=600&h=400&fit=crop)

### 3. 13 种精美样式

1. **经典公众号系列**：默认、技术、优雅、深度阅读
2. **传统媒体系列**：杂志、纽约时报、金融时报、Jony Ive
3. **现代数字系列**：Wired、Medium、Apple、Claude、AI Coder

### 4. 一键复制

点击「复制到公众号」按钮，直接粘贴到公众号后台，格式完美保留！

## 💻 代码示例

\`\`\`javascript
// 图片自动压缩并存储到 IndexedDB
const compressedBlob = await imageCompressor.compress(file);
await imageStore.saveImage(imageId, compressedBlob);

// 编辑器中插入短链接
const markdown = \`![图片](img://\${imageId})\`;
\`\`\`

## 📖 引用样式

> 这是一段引用文字，展示编辑器的引用样式效果。
>
> 不同的样式主题会有不同的引用样式，试试切换样式看看效果！

## 📊 表格支持

| 功能 | 支持情况 | 说明 |
|------|---------|------|
| 图片粘贴 | ✅ | 100% 成功率 |
| 刷新保留 | ✅ | IndexedDB 存储 |
| 样式主题 | ✅ | 13 种精选样式 |
| 代码高亮 | ✅ | 多语言支持 |

---

**💡 提示**：

- 试着切换不同的样式主题，体验各种风格的排版效果
- 粘贴图片试试智能压缩功能
- 刷新页面看看内容是否保留

**🌟 开源项目**：如果觉得有用，欢迎访问 [GitHub 仓库](https://github.com/alchaincyf/huasheng_editor) 给个 Star！`;
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

    async renderMarkdown() {
      if (!this.markdownInput.trim()) {
        this.renderedContent = '';
        return;
      }

      // 检查 markdown-it 是否已初始化
      if (!this.md) {
        console.warn('markdown-it 尚未初始化，跳过渲染');
        return;
      }

      // 预处理 Markdown
      const processedContent = this.preprocessMarkdown(this.markdownInput);

      // 渲染
      let html = this.md.render(processedContent);

      // 处理 img:// 协议（从 IndexedDB 加载图片）
      html = await this.processImageProtocol(html);

      // 应用样式
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

    // 处理 img:// 协议（从 IndexedDB 加载图片）
    async processImageProtocol(html) {
      if (!this.imageStore) {
        return html;
      }

      // 使用 DOMParser 解析 HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // 查找所有 img 标签
      const images = doc.querySelectorAll('img');

      // 处理每个图片
      for (const img of images) {
        const src = img.getAttribute('src');

        // 检查是否是 img:// 协议
        if (src && src.startsWith('img://')) {
          // 提取图片 ID
          const imageId = src.replace('img://', '');

          try {
            // 从 IndexedDB 获取图片
            let objectURL = this.imageIdToObjectURL[imageId];

            if (!objectURL) {
              // 如果还没有创建 Object URL，现在创建
              objectURL = await this.imageStore.getImage(imageId);

              if (objectURL) {
                // 缓存 Object URL
                this.imageIdToObjectURL[imageId] = objectURL;
              } else {
                console.warn(`图片不存在: ${imageId}`);
                // 图片不存在，显示占位符
                img.setAttribute('src', 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3E图片丢失%3C/text%3E%3C/svg%3E');
                continue;
              }
            }

            // 替换 src 为 Object URL
            img.setAttribute('src', objectURL);

            // 添加 data-image-id 属性（用于复制时识别）
            img.setAttribute('data-image-id', imageId);
          } catch (error) {
            console.error(`加载图片失败 (${imageId}):`, error);
            // 显示错误占位符
            img.setAttribute('src', 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23fee" width="200" height="200"/%3E%3Ctext fill="%23c00" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3E加载失败%3C/text%3E%3C/svg%3E');
          }
        }
      }

      return doc.body.innerHTML;
    },

    applyInlineStyles(html) {
      const style = STYLES[this.currentStyle].styles;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // 先处理图片网格布局（在应用样式之前）
      this.groupConsecutiveImages(doc);

      Object.keys(style).forEach(selector => {
        if (selector === 'pre' || selector === 'code' || selector === 'pre code') {
          return;
        }

        // 跳过已经在网格容器中的图片
        const elements = doc.querySelectorAll(selector);
        elements.forEach(el => {
          // 如果是图片且在网格容器内，跳过样式应用
          if (el.tagName === 'IMG' && el.closest('.image-grid')) {
            return;
          }

          const currentStyle = el.getAttribute('style') || '';
          el.setAttribute('style', currentStyle + '; ' + style[selector]);
        });
      });

      const container = doc.createElement('div');
      container.setAttribute('style', style.container);
      container.innerHTML = doc.body.innerHTML;

      return container.outerHTML;
    },

    groupConsecutiveImages(doc) {
      const body = doc.body;
      const children = Array.from(body.children);

      let imagesToProcess = [];

      // 找出所有图片元素，处理两种情况：
      // 1. 多个图片在同一个<p>标签内（连续图片）
      // 2. 每个图片在单独的<p>标签内（分隔的图片）
      children.forEach((child, index) => {
        if (child.tagName === 'P') {
          const images = child.querySelectorAll('img');
          if (images.length > 0) {
            // 如果一个P标签内有多个图片，它们肯定是连续的
            if (images.length > 1) {
              // 多个图片在同一个P标签内，作为一组
              const group = Array.from(images).map(img => ({
                element: child,
                img: img,
                index: index,
                inSameParagraph: true,
                paragraphImageCount: images.length
              }));
              imagesToProcess.push(...group);
            } else if (images.length === 1) {
              // 单个图片在P标签内
              imagesToProcess.push({
                element: child,
                img: images[0],
                index: index,
                inSameParagraph: false,
                paragraphImageCount: 1
              });
            }
          }
        } else if (child.tagName === 'IMG') {
          // 直接是图片元素（少见情况）
          imagesToProcess.push({
            element: child,
            img: child,
            index: index,
            inSameParagraph: false,
            paragraphImageCount: 1
          });
        }
      });

      // 分组逻辑
      let groups = [];
      let currentGroup = [];

      imagesToProcess.forEach((item, i) => {
        if (i === 0) {
          currentGroup.push(item);
        } else {
          const prevItem = imagesToProcess[i - 1];

          // 判断是否连续的条件：
          // 1. 在同一个P标签内的图片肯定是连续的
          // 2. 不同P标签的图片，要看索引是否相邻（差值为1表示相邻）
          let isContinuous = false;

          if (item.index === prevItem.index) {
            // 同一个P标签内的图片
            isContinuous = true;
          } else if (item.index - prevItem.index === 1) {
            // 相邻的P标签，表示连续（没有空行）
            isContinuous = true;
          }
          // 如果索引差大于1，说明中间有其他元素或空行，不连续

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
        // 只有2张及以上的图片才需要特殊布局
        if (group.length < 2) return;

        const imageCount = group.length;
        const firstElement = group[0].element;

        // 创建容器
        const gridContainer = doc.createElement('div');
        gridContainer.setAttribute('class', 'image-grid');
        gridContainer.setAttribute('data-image-count', imageCount);

        // 根据图片数量设置网格样式
        let gridStyle = '';
        let columns = 2; // 默认2列

        if (imageCount === 2) {
          gridStyle = `
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin: 20px auto;
            max-width: 100%;
            align-items: start;
          `;
          columns = 2;
        } else if (imageCount === 3) {
          gridStyle = `
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin: 20px auto;
            max-width: 100%;
            align-items: start;
          `;
          columns = 3;
        } else if (imageCount === 4) {
          gridStyle = `
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin: 20px auto;
            max-width: 100%;
            align-items: start;
          `;
          columns = 2;
        } else {
          // 5张及以上，使用3列
          gridStyle = `
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin: 20px auto;
            max-width: 100%;
            align-items: start;
          `;
          columns = 3;
        }

        gridContainer.setAttribute('style', gridStyle);
        gridContainer.setAttribute('data-columns', columns);

        // 将图片添加到容器中
        group.forEach((item) => {
          const imgWrapper = doc.createElement('div');

          imgWrapper.setAttribute('style', `
            width: 100%;
            height: auto;
            overflow: hidden;
          `);

          const img = item.img.cloneNode(true);
          // 修改图片样式以适应容器，添加圆角
          img.setAttribute('style', `
            width: 100%;
            height: auto;
            display: block;
            border-radius: 8px;
          `.trim());

          imgWrapper.appendChild(img);
          gridContainer.appendChild(imgWrapper);
        });

        // 替换原来的图片元素
        firstElement.parentNode.insertBefore(gridContainer, firstElement);

        // 删除原来的图片元素（需要去重，避免重复删除同一个元素）
        const elementsToRemove = new Set();
        group.forEach(item => {
          elementsToRemove.add(item.element);
        });
        elementsToRemove.forEach(element => {
          if (element.parentNode) {
            element.parentNode.removeChild(element);
          }
        });
      });
    },

    convertGridToTable(doc) {
      // 找到所有的图片网格容器
      const imageGrids = doc.querySelectorAll('.image-grid');

      imageGrids.forEach(grid => {
        // 从data属性获取列数（我们在创建时设置的）
        const columns = parseInt(grid.getAttribute('data-columns')) || 2;
        this.convertToTable(doc, grid, columns);
      });
    },

    convertToTable(doc, grid, columns) {
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

      // 优先处理：检查是否有 data-image-id（来自 IndexedDB）
      const imageId = imgElement.getAttribute('data-image-id');
      if (imageId && this.imageStore) {
        try {
          // 从 IndexedDB 获取图片 Blob
          const blob = await this.imageStore.getImageBlob(imageId);

          if (blob) {
            // 将 Blob 转为 Base64
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = (error) => reject(new Error('FileReader failed: ' + error));
              reader.readAsDataURL(blob);
            });
          } else {
            console.warn(`图片 Blob 不存在: ${imageId}`);
            // 继续尝试用 fetch 方式（兜底）
          }
        } catch (error) {
          console.error(`从 IndexedDB 读取图片失败 (${imageId}):`, error);
          // 继续尝试用 fetch 方式（兜底）
        }
      }

      // 后备方案：尝试通过 URL 获取图片
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
      const recommended = ['nikkei', 'wechat-anthropic', 'wechat-ft', 'wechat-nyt', 'latepost-depth', 'wechat-tech'];
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
    async handleSmartPaste(event) {
      console.log('===== handleSmartPaste 被调用 =====');

      const clipboardData = event.clipboardData || event.originalEvent?.clipboardData;

      if (!clipboardData) {
        console.log('不支持 clipboardData');
        return; // 不支持的浏览器，使用默认行为
      }

      // 调试模式（需要时可以打开）
      const DEBUG = true;
      if (DEBUG) {
        console.log('剪贴板数据类型:', Array.from(clipboardData.types || []));
      }

      // 检查是否有文件（某些应用复制图片会作为文件）
      if (clipboardData.files && clipboardData.files.length > 0) {
        if (DEBUG) console.log('检测到文件:', clipboardData.files[0]);
        const file = clipboardData.files[0];
        if (file && file.type && file.type.startsWith('image/')) {
          event.preventDefault();
          await this.handleImageUpload(file, event.target);
          return;
        }
      }

      // 检查 items（浏览器复制的图片通常在这里）
      const items = clipboardData.items;
      if (items) {
        for (let item of items) {
          if (DEBUG) console.log('Item 类型:', item.type, 'Kind:', item.kind);

          // 检查是否是图片
          if (item.kind === 'file' && item.type && item.type.indexOf('image') !== -1) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) {
              await this.handleImageUpload(file, event.target);
              return; // 处理完图片就返回
            }
          }
        }
      }

      // 获取剪贴板中的各种格式数据
      const htmlData = clipboardData.getData('text/html');
      const textData = clipboardData.getData('text/plain');

      // 检查是否是类似 [Image #2] 这样的占位符文本
      if (textData && /^\[Image\s*#?\d*\]$/i.test(textData.trim())) {
        if (DEBUG) console.warn('检测到图片占位符文本，但无法获取实际图片数据');
        this.showToast('⚠️ 请尝试：截图工具 / 浏览器复制 / 拖拽文件', 'error');
        event.preventDefault();
        return; // 不插入占位符文本
      }

      if (DEBUG) {
        console.log('纯文本数据:', textData?.substring(0, 200));
        console.log('HTML 数据:', htmlData?.substring(0, 200));
        console.log('是否检测为 Markdown:', textData && this.isMarkdown(textData));
        console.log('是否有 turndownService:', !!this.turndownService);
      }

      // 检查是否来自 IDE/代码编辑器的 HTML（需要特殊处理）
      const isFromIDE = this.isIDEFormattedHTML(htmlData, textData);

      if (DEBUG) {
        console.log('是否来自 IDE:', isFromIDE);
      }

      if (isFromIDE && textData && this.isMarkdown(textData)) {
        // 来自 IDE 的 Markdown 代码，直接使用纯文本（避免转义）
        if (DEBUG) console.log('检测到 IDE 复制的 Markdown 代码，使用纯文本');
        return; // 使用默认粘贴行为
      }

      // 处理 HTML 数据（富文本编辑器或其他来源）
      if (htmlData && htmlData.trim() !== '' && this.turndownService) {
        // 检查是否是从代码编辑器复制的（精确匹配真正的代码块标签，避免误判）
        // 只有当 HTML 主要由 <pre> 或 <code> 组成时才跳过转换
        const hasPreTag = /<pre[\s>]/.test(htmlData);
        const hasCodeTag = /<code[\s>]/.test(htmlData);
        const isMainlyCode = (hasPreTag || hasCodeTag) && !htmlData.includes('<p') && !htmlData.includes('<div');

        if (isMainlyCode) {
          // 真正的代码编辑器内容，使用纯文本
          if (DEBUG) console.log('检测到代码编辑器格式，使用纯文本');
          return; // 使用默认粘贴行为
        }

        // 检查 HTML 中是否包含本地文件路径的图片（如 file:/// 协议）
        if (htmlData.includes('file:///') || htmlData.includes('src="file:')) {
          if (DEBUG) console.warn('检测到本地文件路径的图片，无法直接上传');
          this.showToast('⚠️ 本地图片请直接拖拽文件到编辑器', 'error');
          event.preventDefault();
          return;
        }

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
          if (DEBUG) console.error('HTML 转 Markdown 失败:', error);
          // 转换失败，使用纯文本
          this.insertTextAtCursor(event.target, textData);
        }
      }
      // 检查纯文本是否为 Markdown（后备方案，只有在没有 HTML 时才检查）
      else if (textData && this.isMarkdown(textData)) {
        // 已经是 Markdown，直接使用纯文本
        if (DEBUG) console.log('没有 HTML，但检测到 Markdown 格式，使用纯文本');
        return; // 使用默认粘贴行为
      }
      // 普通文本，使用默认粘贴行为
      else {
        if (DEBUG) console.log('普通文本，使用默认粘贴行为');
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
        /^\|.*\|$/m,             // 表格
        /<!--.*?-->/,            // HTML 注释（我们的图片注释）
        /^---+$/m                // 分隔线
      ];

      // 计算匹配的特征数量
      const matchCount = patterns.filter(pattern => pattern.test(text)).length;

      // 如果有 2 个或以上的 Markdown 特征，认为是 Markdown
      // 或者如果包含我们的图片注释，也认为是 Markdown
      return matchCount >= 2 || text.includes('<!-- img:');
    },

    // 检测 HTML 是否来自 IDE/代码编辑器
    isIDEFormattedHTML(htmlData, textData) {
      if (!htmlData || !textData) return false;

      // IDE 复制的 HTML 特征（VS Code、Cursor、Sublime Text 等）
      const ideSignatures = [
        // VS Code 特征
        /<meta\s+charset=['"]utf-8['"]/i,
        /<div\s+class=["']ace_line["']/,
        /style=["'][^"']*font-family:\s*['"]?(?:Consolas|Monaco|Menlo|Courier)/i,

        // 简单的 div/span 结构（没有富文本语义标签）
        // 检查：有 HTML 标签，但几乎没有 <p>, <h1-h6>, <strong>, <em> 等富文本标签
        function(html) {
          const hasDivSpan = /<(?:div|span)[\s>]/.test(html);
          const hasSemanticTags = /<(?:p|h[1-6]|strong|em|ul|ol|li|blockquote)[\s>]/i.test(html);
          // 如果有 div/span 但几乎没有语义标签，可能是代码编辑器
          return hasDivSpan && !hasSemanticTags;
        },

        // 检查 HTML 是否只是简单包裹纯文本（几乎没有格式化）
        function(html) {
          // 去除所有 HTML 标签，看是否与纯文本几乎一致
          const strippedHtml = html.replace(/<[^>]+>/g, '').trim();
          const similarity = strippedHtml === textData.trim();
          return similarity;
        }
      ];

      // 检查是否匹配任何 IDE 特征
      let matchCount = 0;
      for (const signature of ideSignatures) {
        if (typeof signature === 'function') {
          if (signature(htmlData)) matchCount++;
        } else if (signature.test(htmlData)) {
          matchCount++;
        }
      }

      // 如果匹配 2 个或以上特征，认为是 IDE 格式
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
    },

    // 处理图片上传 - 压缩并存储到 IndexedDB
    async handleImageUpload(file, textarea) {
      // 检查文件类型
      if (!file.type.startsWith('image/')) {
        this.showToast('请上传图片文件', 'error');
        return;
      }

      // 检查文件大小（10MB限制）
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        this.showToast('图片大小不能超过 10MB', 'error');
        return;
      }

      const imageName = file.name.replace(/\.[^/.]+$/, '') || '图片';
      const originalSize = file.size;

      try {
        // 第一步：压缩图片
        this.showToast('🔄 正在压缩图片...', 'success');

        const compressedBlob = await this.imageCompressor.compress(file);
        const compressedSize = compressedBlob.size;

        // 计算压缩率
        const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(0);
        console.log(`图片压缩完成: ${ImageCompressor.formatSize(originalSize)} → ${ImageCompressor.formatSize(compressedSize)} (压缩 ${compressionRatio}%)`);

        // 第二步：生成唯一 ID
        const imageId = `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // 第三步：存储到 IndexedDB
        await this.imageStore.saveImage(imageId, compressedBlob, {
          name: imageName,
          originalName: file.name,
          originalSize: originalSize,
          compressedSize: compressedSize,
          compressionRatio: compressionRatio,
          mimeType: compressedBlob.type || file.type
        });

        // 第四步：插入 img:// 协议的短链接到编辑器
        const markdownImage = `![${imageName}](img://${imageId})`;

        if (textarea) {
          const currentPos = textarea.selectionStart;
          const before = this.markdownInput.substring(0, currentPos);
          const after = this.markdownInput.substring(currentPos);

          this.markdownInput = before + markdownImage + after;

          this.$nextTick(() => {
            const newPos = currentPos + markdownImage.length;
            textarea.selectionStart = textarea.selectionEnd = newPos;
            textarea.focus();
          });
        } else {
          this.markdownInput += '\n' + markdownImage;
        }

        // 第五步：显示成功提示
        if (compressionRatio > 10) {
          this.showToast(`✅ 已保存 (${ImageCompressor.formatSize(originalSize)} → ${ImageCompressor.formatSize(compressedSize)})`, 'success');
        } else {
          this.showToast(`✅ 已保存 (${ImageCompressor.formatSize(compressedSize)})`, 'success');
        }
      } catch (error) {
        console.error('图片处理失败:', error);
        this.showToast('❌ 图片处理失败: ' + error.message, 'error');
      }
    },

    // 处理文件拖拽
    handleDrop(event) {
      event.preventDefault();
      event.stopPropagation();

      this.isDraggingOver = false;

      const files = event.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('image/')) {
          this.handleImageUpload(file, event.target);
        } else {
          this.showToast('只支持拖拽图片文件', 'error');
        }
      }
    },

    // 阻止默认拖拽行为
    handleDragOver(event) {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'copy';
      this.isDraggingOver = true;
    },

    // 处理拖拽进入
    handleDragEnter(event) {
      event.preventDefault();
      this.isDraggingOver = true;
    },

    // 处理拖拽离开
    handleDragLeave(event) {
      event.preventDefault();
      // 只有当真正离开编辑器时才移除状态
      if (event.target.classList.contains('markdown-input')) {
        this.isDraggingOver = false;
      }
    },

    // ============ 小红书功能相关方法 ============

    // 生成小红书图片
    async generateXiaohongshuImages() {
      if (!this.renderedContent) {
        this.showToast('没有内容可生成', 'error');
        return;
      }

      if (typeof html2canvas === 'undefined') {
        this.showToast('html2canvas 库未加载', 'error');
        return;
      }

      this.xiaohongshuGenerating = true;
      this.xiaohongshuImages = [];

      try {
        // 创建临时渲染容器
        const tempContainer = this.createXiaohongshuContainer();
        document.body.appendChild(tempContainer);

        // 计算文章信息
        const articleInfo = this.calculateArticleInfo();

        // 分页
        const pages = await this.splitContentIntoPages(tempContainer, articleInfo);

        if (pages.length === 0) {
          throw new Error('内容为空，无法生成图片');
        }

        // 生成每一页的图片
        for (let i = 0; i < pages.length; i++) {
          const pageElement = pages[i];

          // 添加页码
          this.addPageNumber(pageElement, i + 1, pages.length);

          // 如果是首页，添加信息面板
          if (i === 0) {
            this.addInfoPanel(pageElement, articleInfo);
          }

          // 将页面元素添加到容器中，确保 html2canvas 可以找到它
          tempContainer.appendChild(pageElement);

          // 等待一小段时间确保元素渲染完成
          await new Promise(resolve => setTimeout(resolve, 100));

          // 生成图片
          const canvas = await html2canvas(pageElement, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: this.getBackgroundColor(),
            width: 750,
            height: 1000,
            windowWidth: 750,
            windowHeight: 1000,
            logging: false
          });

          const dataUrl = canvas.toDataURL('image/png');
          this.xiaohongshuImages.push({
            dataUrl: dataUrl,
            pageNumber: i + 1,
            totalPages: pages.length
          });

          // 移除页面元素，准备下一页
          tempContainer.removeChild(pageElement);
        }

        // 清理临时容器
        document.body.removeChild(tempContainer);

        this.showToast(`成功生成 ${pages.length} 张小红书图片`, 'success');
      } catch (error) {
        console.error('生成小红书图片失败:', error);
        this.showToast('生成失败: ' + error.message, 'error');

        // 确保清理临时容器
        const existingContainer = document.querySelector('div[style*="-9999px"]');
        if (existingContainer) {
          document.body.removeChild(existingContainer);
        }
      } finally {
        this.xiaohongshuGenerating = false;
      }
    },

    // 创建小红书渲染容器
    createXiaohongshuContainer() {
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '750px';
      container.style.pointerEvents = 'none';
      container.style.zIndex = '-1';
      // 不设置 visibility: hidden，因为 html2canvas 需要可见元素
      return container;
    },

    // 计算文章信息
    calculateArticleInfo() {
      const parser = new DOMParser();
      const doc = parser.parseFromString(this.renderedContent, 'text/html');

      // 计算字数（去除HTML标签）
      const textContent = doc.body.textContent || '';
      const charCount = textContent.replace(/\s/g, '').length;

      // 计算阅读时长（假设每分钟阅读400字）
      const readingTime = Math.ceil(charCount / 400);

      // 计算图片数量
      const imageCount = doc.querySelectorAll('img').length;

      return {
        charCount,
        readingTime,
        imageCount
      };
    },

    // 分页算法 - 完全简化版本
    async splitContentIntoPages(container, articleInfo) {
      // 解析 Markdown 为纯文本结构（不使用复杂的渲染样式）
      const simplifiedContent = this.createSimplifiedContent();

      const pages = [];
      const maxPageHeight = 850; // 留出空间给页码和首页信息面板

      // 创建测量容器
      const measureContainer = this.createPageElement();
      container.appendChild(measureContainer);

      let currentPageContent = [];
      let currentHeight = 0;
      const firstPageOffset = 120; // 首页信息面板占用空间

      for (let i = 0; i < simplifiedContent.length; i++) {
        const block = simplifiedContent[i];

        // 创建元素
        const element = this.createSimplifiedElement(block);

        // 添加到测量容器
        measureContainer.appendChild(element);
        const elementHeight = element.offsetHeight || 50;

        // 计算是否超出页面高度
        const heightLimit = pages.length === 0 ? maxPageHeight - firstPageOffset : maxPageHeight;
        const wouldExceed = currentHeight + elementHeight > heightLimit;

        if (wouldExceed && currentPageContent.length > 0) {
          // 创建新页面
          const page = this.createPageElement();
          currentPageContent.forEach(el => page.appendChild(el));
          pages.push(page);

          currentPageContent = [];
          currentHeight = 0;
        }

        // 从测量容器移除
        measureContainer.removeChild(element);
        currentPageContent.push(element);
        currentHeight += elementHeight;
      }

      // 添加最后一页
      if (currentPageContent.length > 0) {
        const page = this.createPageElement();
        currentPageContent.forEach(el => page.appendChild(el));
        pages.push(page);
      }

      // 清理测量容器
      container.removeChild(measureContainer);

      return pages;
    },

    // 创建简化的内容结构（纯文本，无复杂样式）
    createSimplifiedContent() {
      const lines = this.markdownInput.split('\n');
      const content = [];

      lines.forEach(line => {
        line = line.trim();
        if (!line) return;

        // 标题
        if (line.startsWith('# ')) {
          content.push({ type: 'h1', text: line.substring(2) });
        } else if (line.startsWith('## ')) {
          content.push({ type: 'h2', text: line.substring(3) });
        } else if (line.startsWith('### ')) {
          content.push({ type: 'h3', text: line.substring(4) });
        }
        // 列表
        else if (line.startsWith('- ') || line.startsWith('* ')) {
          content.push({ type: 'li', text: line.substring(2) });
        }
        // 引用
        else if (line.startsWith('> ')) {
          content.push({ type: 'quote', text: line.substring(2) });
        }
        // 代码块标记（跳过）
        else if (line.startsWith('```')) {
          // 跳过代码块
        }
        // 图片（跳过，小红书图片由外链显示）
        else if (line.startsWith('![')) {
          // 跳过图片
        }
        // 分隔线
        else if (line === '---') {
          content.push({ type: 'hr' });
        }
        // 普通段落
        else {
          // 移除 Markdown 格式标记
          let text = line.replace(/\*\*(.+?)\*\*/g, '$1'); // 粗体
          text = text.replace(/\*(.+?)\*/g, '$1'); // 斜体
          text = text.replace(/`(.+?)`/g, '$1'); // 行内代码
          content.push({ type: 'p', text: text });
        }
      });

      return content;
    },

    // 创建简化的元素（只使用基本的内联样式）
    createSimplifiedElement(block) {
      const el = document.createElement('div');

      switch (block.type) {
        case 'h1':
          el.textContent = block.text;
          el.style.fontSize = '28px';
          el.style.fontWeight = 'bold';
          el.style.margin = '20px 0 10px 0';
          el.style.color = '#000';
          break;
        case 'h2':
          el.textContent = block.text;
          el.style.fontSize = '24px';
          el.style.fontWeight = 'bold';
          el.style.margin = '16px 0 8px 0';
          el.style.color = '#000';
          break;
        case 'h3':
          el.textContent = block.text;
          el.style.fontSize = '20px';
          el.style.fontWeight = 'bold';
          el.style.margin = '12px 0 6px 0';
          el.style.color = '#333';
          break;
        case 'p':
          el.textContent = block.text;
          el.style.fontSize = '16px';
          el.style.lineHeight = '1.8';
          el.style.margin = '8px 0';
          el.style.color = '#333';
          break;
        case 'li':
          el.textContent = '• ' + block.text;
          el.style.fontSize = '16px';
          el.style.lineHeight = '1.8';
          el.style.margin = '4px 0';
          el.style.paddingLeft = '10px';
          el.style.color = '#333';
          break;
        case 'quote':
          el.textContent = block.text;
          el.style.fontSize = '15px';
          el.style.lineHeight = '1.8';
          el.style.margin = '8px 0';
          el.style.padding = '10px 15px';
          el.style.borderLeft = '3px solid #0066FF';
          el.style.background = '#f5f5f5';
          el.style.color = '#666';
          break;
        case 'hr':
          el.style.height = '1px';
          el.style.background = '#ddd';
          el.style.margin = '20px 0';
          el.style.border = 'none';
          break;
      }

      return el;
    },

    // 创建页面元素
    createPageElement() {
      const page = document.createElement('div');
      page.style.width = '750px';
      page.style.height = '1000px';
      page.style.backgroundColor = this.getBackgroundColor();
      page.style.padding = '80px 40px 40px 40px';
      page.style.boxSizing = 'border-box';
      page.style.position = 'relative';
      page.style.overflow = 'hidden';
      page.style.fontFamily = 'Arial';
      page.style.fontSize = '16px';
      page.style.lineHeight = '1.8';
      page.style.color = '#333';
      return page;
    },

    // 添加页码
    addPageNumber(pageElement, currentPage, totalPages) {
      const pageNumber = document.createElement('div');
      pageNumber.textContent = `${currentPage}/${totalPages}`;
      pageNumber.style.position = 'absolute';
      pageNumber.style.bottom = '30px';
      pageNumber.style.right = '40px';
      pageNumber.style.fontSize = '14px';
      pageNumber.style.color = '#999';
      pageNumber.style.fontWeight = '500';
      pageElement.appendChild(pageNumber);
    },

    // 添加首页信息面板
    addInfoPanel(pageElement, articleInfo) {
      const panel = document.createElement('div');
      panel.style.position = 'absolute';
      panel.style.top = '20px';
      panel.style.left = '40px';
      panel.style.right = '40px';
      panel.style.padding = '20px';
      panel.style.backgroundColor = '#E6F0FF';
      panel.style.borderRadius = '8px';
      panel.style.border = '1px solid #99CCFF';

      const infoItems = [
        { label: '字数', value: articleInfo.charCount },
        { label: '阅读', value: `${articleInfo.readingTime}分钟` },
        { label: '图片', value: `${articleInfo.imageCount}张` }
      ];

      // 创建容器（使用 table 布局）
      const table = document.createElement('table');
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';
      const tr = document.createElement('tr');

      infoItems.forEach(item => {
        const td = document.createElement('td');
        td.style.textAlign = 'center';
        td.style.padding = '5px';

        const valueDiv = document.createElement('div');
        valueDiv.textContent = item.value;
        valueDiv.style.fontSize = '24px';
        valueDiv.style.fontWeight = 'bold';
        valueDiv.style.color = '#0066FF';
        valueDiv.style.marginBottom = '4px';

        const labelDiv = document.createElement('div');
        labelDiv.textContent = item.label;
        labelDiv.style.fontSize = '12px';
        labelDiv.style.color = '#666';

        td.appendChild(valueDiv);
        td.appendChild(labelDiv);
        tr.appendChild(td);
      });

      table.appendChild(tr);
      panel.appendChild(table);

      // 插入到页面顶部
      pageElement.insertBefore(panel, pageElement.firstChild);
    },

    // 获取背景色
    getBackgroundColor() {
      const styleConfig = STYLES[this.currentStyle];
      if (styleConfig && styleConfig.styles && styleConfig.styles.container) {
        const bgColor = this.extractBackgroundColor(styleConfig.styles.container);
        return bgColor || '#FFFFFF';
      }
      return '#FFFFFF';
    },

    // 下载单张小红书图片
    downloadXiaohongshuImage(image, index) {
      const link = document.createElement('a');
      link.download = `小红书-第${index + 1}张-共${this.xiaohongshuImages.length}张.png`;
      link.href = image.dataUrl;
      link.click();
      this.showToast(`下载第 ${index + 1} 张图片`, 'success');
    },

    // 批量下载小红书图片
    async downloadAllXiaohongshuImages() {
      if (this.xiaohongshuImages.length === 0) {
        this.showToast('没有图片可下载', 'error');
        return;
      }

      this.showToast(`开始下载 ${this.xiaohongshuImages.length} 张图片...`, 'success');

      for (let i = 0; i < this.xiaohongshuImages.length; i++) {
        const image = this.xiaohongshuImages[i];

        // 添加延迟，避免浏览器阻止批量下载
        await new Promise(resolve => setTimeout(resolve, 300));

        const link = document.createElement('a');
        link.download = `小红书-第${i + 1}张-共${this.xiaohongshuImages.length}张.png`;
        link.href = image.dataUrl;
        link.click();
      }

      this.showToast('批量下载完成', 'success');
    }
  }
});

editorApp.mount('#app');
