# Cooper Push-to-Talk for macOS

This helper gives Cooper a global macOS push-to-talk key without using a global event tap.

It uses:

- `RegisterEventHotKey` for press/release events.
- `AVAudioRecorder` for local microphone capture only while the key is held.
- A floating top-center HUD with waveform states: `Listening`, `Thinking`, and `running tool`.
- A token-gated local HTTP call to Cooper after release.

Nothing is sent to OpenAI while idle. The helper records locally during the key hold, then posts the completed utterance to the local Cooper server.

## Build

```bash
npm run ptt:build
```

## Configure

Copy the example config:

```bash
mkdir -p ~/.cooper
cp native/push-to-talk/push-to-talk.example.json ~/.cooper/push-to-talk.json
```

Set the same token in `.env`:

```bash
COOPER_PTT_TOKEN=replace-with-a-long-random-local-token
```

Then put that same value in `~/.cooper/push-to-talk.json`.

Default hotkey:

```json
{
  "keyCode": 49,
  "modifiers": ["control", "option"]
}
```

That is `control+option+space`. Change `keyCode` and `modifiers` to choose another key. The helper also supports environment overrides:

```bash
COOPER_PTT_KEY_CODE=49
COOPER_PTT_MODIFIERS=control+option
COOPER_PTT_SERVER_URL=http://127.0.0.1:5000
COOPER_PTT_TOKEN=...
```

## Run

Start Cooper first:

```bash
npm run dev
```

Then start the helper:

```bash
npm run ptt:run
```

Hold the hotkey, speak, release. Cooper will transcribe the utterance and either:

- queue a visible Computer Use task for commands like `open Spotify`, `open Claude Code`, or `download https://...`;
- stop active Computer Use work for commands like `stop computer`;
- return a one-shot Cooper response for normal questions.

## Notes

macOS may prompt for microphone permission the first time. If it is denied, enable microphone access for the built helper or Terminal in System Settings.
