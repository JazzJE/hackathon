# ✳ Doodle Do

**Bad drawings. Real consequences.** A Windows desktop app that turns sketches into computer actions. Draw a tab with an X to close a tab, a Spotify logo to open Spotify, or a more elaborate idea to generate a PowerShell plan.

## Run locally — no API key

Windows 10/11, Node.js 22+ and npm are required for development. The portable **Doodle Do.exe** needs neither Node.js nor npm, but still needs Ollama and the model.

```powershell
# One-time setup: installs Ollama and downloads the local vision model.
powershell -ExecutionPolicy Bypass -File .\setup-local.ps1

npm install
npm start
```

Or launch the portable **Doodle Do.exe** after setup. Local AI is the default. Draw, click **Make it happen**, inspect the plan, and click **Run this plan**. No account, API key, or per-request API charges. After the initial downloads, local recognition works without internet; actions that open websites or install apps still require it.

The default model is **Gemma 3 4B** (roughly 3.4 GB to download), served through [Ollama](https://ollama.com/library/gemma3:4b) on `127.0.0.1:11434`. Allow several additional GB for the runtime and memory during inference. The first drawing takes longer while the model loads. CPU-only systems can take tens of seconds or minutes. Drawings and hints stay on this computer in local mode. A local model can misinterpret drawings; the displayed confidence is the model's own estimate.

The app starts an installed Ollama server if needed. In **Settings → Check local AI**, check whether your selected model is installed. If a download is interrupted, rerun setup or `ollama pull gemma3:4b`; Ollama resumes the download. You can choose another installed vision-capable model in Settings. Engine and model preferences persist across launches; permission toggles reset per session.

## Optional OpenAI mode

Select **OpenAI** in Settings, enter an API key, and choose an image-capable Responses API model available to your account. Default: `gpt-4.1-mini`. You can also set `OPENAI_API_KEY` before starting. The key is held in session memory, never saved by this app. Cloud mode sends your drawing and hint to OpenAI and uses separate API billing. Local mode never sends your drawing or key to OpenAI.

The three example cards load **preset demo plans**, not AI recognition. Click **Run this plan** for a real computer action, or **Make it happen** to send the example drawing through the actual vision model.

## The loop

1. Draw using mouse, pen, or touch. Undo, erase, clear, and adjust brush size.
2. Optionally add a hint. Click **Make it happen**.
3. AI returns a title, explanation, confidence, and up to eight actions. No desktop screenshots or other computer data are sent to the model.
4. Inspect the plan, then run it. Low-confidence plans cannot execute.
5. The sketchpad minimizes, returning focus to the previous window. Shortcuts affect that window. A result appears when execution finishes.

## What it can do

- Open Chrome, Firefox, Spotify, Discord, VS Code, VLC, Notepad, Calculator, Paint, and Explorer.
- Open HTTP/HTTPS URLs.
- Close/new tab, undo/redo, save, copy/paste, select all, switch windows, show desktop, volume controls.
- With **Install missing apps** enabled, install supported missing third-party apps through exact Winget IDs. Windows may request elevation or installer interaction. After installation, draw the logo again to launch it.
- With **Full computer control** enabled, execute AI-generated PowerShell with your current Windows permissions. This enables broader tasks beyond the built-in actions. It is unrestricted code execution, so read the displayed script before running it.

**Stop actions** or **Ctrl+Alt+Backspace** cancels drawing recognition, terminates the current command tree, and stops subsequent steps. It cannot undo completed actions or terminate an already detached application/installer. Commands time out after three minutes; local recognition after five minutes. The global shortcut works while the sketchpad is minimized; another application may reserve it on some systems.

This is a hackathon prototype: one interpreted plan per drawing, not a screenshot-driven autonomous agent. Keyboard targeting depends on which window regains focus. It does not bypass OS permissions. App discovery uses Start-menu entries then executable lookup; unusual installs may need manual launching.

## Development

```powershell
npm test
npm run check
npm run dist -- --config.compression=store
```

The last command builds a portable Windows executable under `dist/` (unsigned). Electron isolates the renderer with a sandboxed preload and a narrow IPC bridge. The main process validates plans and retains the executable plan rather than accepting scripts from the renderer. Full control and app installation are opt-in per session.

Files: `src/agent.js` (local/cloud vision, validation, Windows command generation), `src/local-ai.js` (local server startup and model availability), `src/main.js` (desktop lifecycle and execution), `src/renderer.js` (canvas and UI). No hosted backend required.

Integrations follow the [Ollama chat API](https://docs.ollama.com/api/chat) and [OpenAI image-input documentation](https://developers.openai.com/api/docs/guides/images-vision).

