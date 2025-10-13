#!/bin/bash

# 公众号 Markdown 编辑器 - 启动脚本

echo "📝 公众号 Markdown 编辑器"
echo "================================"
echo ""
echo "🌐 服务器地址: http://localhost:8080/"
echo "📌 按 Ctrl+C 停止服务器"
echo "================================"
echo ""

# 启动简单的 HTTP 服务器
python3 -m http.server 8080
