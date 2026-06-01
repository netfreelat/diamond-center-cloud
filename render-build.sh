#!/usr/bin/env bash
# exit on error
set -o errexit

# Skip browser download during npm install to avoid memory/timeout issues on Render
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
export PUPPETEER_SKIP_DOWNLOAD=true

npm install

# Download Chrome to the persistent project cache folder using an absolute path
unset PUPPETEER_SKIP_CHROMIUM_DOWNLOAD
unset PUPPETEER_SKIP_DOWNLOAD
export PUPPETEER_CACHE_DIR=$(pwd)/.cache/puppeteer
npx puppeteer browsers install chrome
