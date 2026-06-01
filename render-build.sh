#!/usr/bin/env bash
# exit on error
set -o errexit

export PUPPETEER_CACHE_DIR=./.cache/puppeteer
npm install
npx puppeteer browsers install chrome
