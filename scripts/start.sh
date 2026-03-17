#!/bin/bash
# Launch Electron app (use this script when running from VSCode terminal)
# VSCode sets ELECTRON_RUN_AS_NODE=1 which breaks Electron, so we unset it
cd "$(dirname "$0")/.."
env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron .
