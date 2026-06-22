#!/bin/sh
# Install the chat-with-plan skill into the user-level Claude Code skills dir.
# POSIX sh, no bashisms.

set -eu

SRC_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEST_DIR="$HOME/.claude/skills/chat-with-plan"

echo "Installing chat-with-plan -> $DEST_DIR"

mkdir -p "$DEST_DIR/bin"

cp "$SRC_DIR/SKILL.md" "$DEST_DIR/SKILL.md"
cp "$SRC_DIR/bin/chat-with-plan.mjs" "$DEST_DIR/bin/chat-with-plan.mjs"

chmod +x "$DEST_DIR/bin/chat-with-plan.mjs"

echo "Installed."
echo
echo "Next step — one-time setup (point at your Codex-voice checkout):"
echo "  node ~/.claude/skills/chat-with-plan/bin/chat-with-plan.mjs setup --voice-dir <path-to-Codex-voice>"
