const fs = require('fs');
const path = require('path');

// 确保输出目录存在
const distDir = path.join(__dirname, '../dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
  console.log('Created dist directory');
}

// 确保 Windows 构建目录存在
const winDistDir = path.join(distDir, 'win-unpacked');
if (!fs.existsSync(winDistDir)) {
  fs.mkdirSync(winDistDir, { recursive: true });
  console.log('Created win-unpacked directory');
}

console.log('Pre-build setup completed');
