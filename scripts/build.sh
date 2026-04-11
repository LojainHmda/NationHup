#!/bin/bash
set -e

echo "=== Building frontend ==="
npx vite build

echo "=== Building backend with bundled dependencies ==="
npx esbuild server/index.prod.ts \
  --platform=node \
  --bundle \
  --format=cjs \
  --outfile=dist/index.cjs \
  --external:bcrypt \
  --external:@neondatabase/serverless \
  --external:ws \
  --external:bufferutil \
  --external:utf-8-validate \
  --minify

echo "=== Copying native modules ==="
mkdir -p dist/node_modules
cp -r node_modules/bcrypt dist/node_modules/ 2>/dev/null || true
cp -r node_modules/@neondatabase dist/node_modules/ 2>/dev/null || true
cp -r node_modules/ws dist/node_modules/ 2>/dev/null || true

echo "=== Creating wrapper ==="
echo 'require("./index.cjs");' > dist/index.js

echo "=== Build complete! ==="
