# Realtime Desktop Agent Release Checklist

Date: 2026-07-13
Scope: `native/realtime-desktop-agent`

This checklist keeps the macOS app shippable without depending on root web app files.

## Preflight

- Run the one-command native release preflight:

```sh
node native/realtime-desktop-agent/scripts/release-preflight.mjs
```

This runs parser checks, broker/security smoke, static UI/design-token smoke, WKWebView smoke, Keychain smoke, Debug and Release Xcode builds, Release `.app` resource verification, local `codesign --verify`, and hardened runtime metadata verification. It runs the live Responses artifact smoke when `OPENAI_API_KEY` is set, or when `REALTIME_AGENT_RUN_LIVE_SMOKES=1` is explicitly set.

- Confirm the diff is native-only for this workstream:

```sh
git diff --name-only -- native/realtime-desktop-agent
```

- Run broker and client parser checks:

```sh
node --check native/realtime-desktop-agent/Resources/Broker/server.mjs
node --check native/realtime-desktop-agent/Resources/Web/app.js
node --check native/realtime-desktop-agent/scripts/broker-smoke.mjs
node --check native/realtime-desktop-agent/scripts/keychain-smoke.mjs
node --check native/realtime-desktop-agent/scripts/web-ui-smoke.mjs
node --check native/realtime-desktop-agent/scripts/responses-artifact-smoke.mjs
```

- Run the dependency-free broker/security smoke:

```sh
node native/realtime-desktop-agent/scripts/broker-smoke.mjs
```

- Run the static UI/design-token smoke:

```sh
node native/realtime-desktop-agent/scripts/web-ui-smoke.mjs
```

- Run the WKWebView render/navigation smoke:

```sh
swift native/realtime-desktop-agent/scripts/wkwebview-smoke.swift
```

- Run the Keychain mutation smoke against a temporary service/account:

```sh
node native/realtime-desktop-agent/scripts/keychain-smoke.mjs
```

- When an OpenAI key is available in `OPENAI_API_KEY` or `RealtimeDesktopAgent.OPENAI_API_KEY`, run the credentialed Responses artifact smoke:

```sh
node native/realtime-desktop-agent/scripts/responses-artifact-smoke.mjs
```

## Local Build

- Build Debug locally:

```sh
xcodebuild \
  -project native/realtime-desktop-agent/RealtimeDesktopAgent.xcodeproj \
  -scheme RealtimeDesktopAgent \
  -configuration Debug \
  build
```

- Build Release locally:

```sh
xcodebuild \
  -project native/realtime-desktop-agent/RealtimeDesktopAgent.xcodeproj \
  -scheme RealtimeDesktopAgent \
  -configuration Release \
  build
```

## Signing Setup

The project currently uses manual signing placeholders so local development does not require a team profile. Before external distribution:

- Set `DEVELOPMENT_TEAM` to the Apple Developer Team ID.
- Set a production bundle identifier for the release channel.
- Choose a Developer ID Application signing certificate for direct macOS distribution, or the Mac App Store signing path if that becomes the channel.
- Keep Release `ENABLE_HARDENED_RUNTIME=YES`; `scripts/release-preflight.mjs` fails if this regresses.
- Archive through Xcode Organizer or an equivalent `xcodebuild archive` command after the team and certificate are configured.
- Notarize any direct-distribution build and staple the notarization ticket before sharing the `.app` or `.dmg`.
- Set `REALTIME_AGENT_REQUIRE_DISTRIBUTION_SIGNING=1` when running `scripts/release-preflight.mjs` for a distribution candidate so ad-hoc/manual-placeholder signing fails the preflight.

## Manual Launch Smoke

- Launch the built app.
- Confirm Today loads first and the Start call button is visible.
- Confirm Settings shows broker status, key presence, store path, workspace allowlist, connectors, and diagnostics export.
- Confirm the native header can copy host diagnostics and reveal `latest-host.log`.
- End and relaunch the app, then confirm saved sessions/artifacts still load from the local store.

## Diagnostics

User-safe diagnostics are split across two surfaces:

- Broker JSON: `GET /api/diagnostics`, also available through Settings > Export diagnostics.
- Broker crash/rejection ledger: `~/Library/Application Support/RealtimeDesktopAgent/Diagnostics/broker-crashes.jsonl`, summarized by `GET /api/diagnostics`.
- Native Swift crash ledger: `~/Library/Application Support/RealtimeDesktopAgent/Diagnostics/native-crashes.jsonl`, written by the host exception/signal reporter.
- Swift host log: `~/Library/Application Support/RealtimeDesktopAgent/Diagnostics/latest-host.log`, also available through the native header and Agent menu.

Diagnostics must report secret presence as booleans only. They must not include OpenAI, Notion, Arcade, or signing secrets; broker crash reports are redacted before they are written.

## Release Exit Criteria

- Debug and Release builds complete without resource-copy fixes.
- `scripts/release-preflight.mjs` passes and verifies the Release `.app` bundle resources, hardened runtime metadata, and local codesign validity.
- Broker smoke passes from a clean temporary store.
- Static UI/design-token smoke, WKWebView smoke, and Keychain smoke pass.
- Credentialed Responses artifact smoke passes for any release candidate that claims live artifact generation support.
- Host diagnostics can be copied, broker crash/rejection reports appear in the diagnostics export after a smoke write, native crash reporter installation is logged, and log reveal opens the diagnostics folder.
- Known parity exceptions are captured in `docs/parity-feature-checklist.md`.
- The build has a signing/notarization path appropriate to its release channel.
