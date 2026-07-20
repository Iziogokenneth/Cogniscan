#!/usr/bin/env bash
# build.sh — Render build script for CogniScan backend
set -e

# Install Python dependencies
pip install -r requirements.txt

# Install Playwright's Chromium browser + its system dependencies
playwright install chromium
playwright install-deps chromium
