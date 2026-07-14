#!/bin/sh
set -eu

SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
TARGET_DIR="${HOME}/.claude/skills/chat-with-plan"

mkdir -p "${TARGET_DIR}/bin"
cp "${SOURCE_DIR}/SKILL.md" "${TARGET_DIR}/SKILL.md"
cp "${SOURCE_DIR}/bin/chat-with-plan.mjs" "${TARGET_DIR}/bin/chat-with-plan.mjs"
chmod +x "${TARGET_DIR}/bin/chat-with-plan.mjs"

printf '%s\n' "Installed chat-with-plan at ${TARGET_DIR}"
