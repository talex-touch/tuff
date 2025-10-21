#!/bin/bash

# SVG 转 PNG 图标生成脚本
# 使用方法: ./generate-icons.sh input.svg

SVG_FILE="$1"
OUTPUT_DIR="icons"

if [ -z "$SVG_FILE" ]; then
    echo "使用方法: $0 <svg文件路径>"
    echo "例如: $0 ../public/electron-vite.svg"
    exit 1
fi

if [ ! -f "$SVG_FILE" ]; then
    echo "错误: 文件 $SVG_FILE 不存在"
    exit 1
fi

# 创建输出目录
mkdir -p "$OUTPUT_DIR"

echo "正在从 $SVG_FILE 生成不同尺寸的图标..."

# 定义尺寸数组
sizes=(16 32 48 64 128 256 512 1024)

for size in "${sizes[@]}"; do
    output_file="$OUTPUT_DIR/icon-${size}x${size}.png"
    echo "生成 ${size}x${size} 图标..."
    
    # 使用 sips 转换
    sips -s format png -z $size $size "$SVG_FILE" --out "$output_file"
    
    if [ $? -eq 0 ]; then
        echo "✓ 成功生成 $output_file"
    else
        echo "✗ 生成 $output_file 失败"
    fi
done

echo ""
echo "所有图标已生成到 $OUTPUT_DIR 目录"
echo "文件列表:"
ls -la "$OUTPUT_DIR"
