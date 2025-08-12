#!/bin/bash

# 运行 TUFF Builder 测试
# 测试文件位于 packages/test/src/core-box 目录下
cd "$(dirname "$0")"
cd ../../../
pnpm --filter test test