# ✳ Doodle Do

**Bad drawings. Worse decisions.** A Windows desktop app that turns sketches into questionable computer actions. Creative mode lets the AI choose an action directly from each drawing. Money opens crypto.com/dogecoin as explicitly configured. Turn Creative mode off in Settings for literal computer control.

## Draw over your screen

With the app running, press **Ctrl+Alt+D**. The monitor under your cursor dims like Snipping Tool. Draw directly over the visible desktop, then press **Enter** to run, or **Esc** to cancel. Undo with Ctrl+Z. The **Screen** button opens the same overlay if another app owns the hotkey.

Draw a small X over a Chrome or Edge tab, using one or two strokes. The app targets the tab at the intersection and closes it through Windows accessibility controls, or selects that tab and sends Ctrl+W. Display scaling is converted to physical screen coordinates.

Only the drawn ink goes to the model, not the desktop beneath it. Other screen drawings use the same comedy/literal mode and permissions as the main app. The overlay hides before execution and restores focus to the window you were drawing over.

## Speed first

- Two-stroke X and recognizable dollar signs use immediate gesture recognition, with no model request. Dollar signs use the instant path in Comedy mode.
- A recognizable hint such as `money` or `heart` skips the model in Comedy mode.
- Identical drawings are cached for the session (up to 32); engine, model, hint, and mode are included in the cache key.
- Creative mode uses **Gemma 3 4B** and returns one compact computer action without generating jokes or explanations.
- Local models preload in the background and stay warm for an hour. A persistent Windows helper sends shortcuts/clicks without launching PowerShell for every input. Focus delay is reduced to 120 ms.

Instant X recognition and cached results bypass the model. Gemma 3 4B prioritizes drawing recognition over the smaller model’s latency; cold requests take longer while it loads.

## Run locally — no API key

Windows 10/11, Node.js 22+ and npm are required for development. The portable **Doodle Do.exe** needs neither Node.js nor npm, but still needs Ollama and the model.

```powershell
# One-time setup: installs Ollama and downloads the local vision model.
powershell -ExecutionPolicy Bypass -File .\setup-local.ps1

npm install
npm start
```

Or launch the portable **Doodle Do.exe** after setup. Local AI is the default. Draw and click **Make it happen**: the app interprets your drawing and immediately runs the resulting plan. No second click, account, API key, or per-request API charges. After the initial downloads, local recognition works without internet; actions that open websites or install apps still require it.

The default model is Gemma 3 4B (roughly 3.4 GB), served through Ollama on `127.0.0.1:11434`. It uses a 4096-token context and stays warm for an hour. Drawings and hints stay on this computer in local mode.

The app starts an installed Ollama server if needed. In **Settings → Check local AI**, check whether your selected model is installed. If a download is interrupted, rerun setup or `ollama pull gemma3:4b`; Ollama resumes the download. You can choose another installed vision-capable model in Settings. Engine, model, and comedy preferences persist; permission toggles reset per session. Both creative and literal modes default to Gemma 3 4B.

## Optional OpenAI mode

Select **OpenAI** in Settings, enter an API key, and choose an image-capable Responses API model available to your account. Default: `gpt-4.1-mini`. You can also set `OPENAI_API_KEY` before starting. The key is held in session memory, never saved by this app. Cloud mode sends your drawing and hint to OpenAI and uses separate API billing. Local mode never sends your drawing or key to OpenAI.

The example cards load **preset demo plans**, not AI recognition. Click **Run this plan** for a real computer action, or **Make it happen** to interpret and run the drawing. The dollar-sign example can use the instant gesture path. Comedy actions open real Google/YouTube searches or Crypto.com; nothing makes purchases, trades, or sends messages.

## The loop

1. Draw using mouse, pen, or touch. Undo, erase, clear, and adjust brush size.
2. Optionally add a hint. Click **Make it happen**.
3. A gesture, hint, cache hit, or AI returns the action. AI generates only the short action, with the displayed explanation built locally. No desktop screenshots or other computer data are sent to the model.
4. The plan appears and runs automatically, including low-confidence best guesses. If the AI finds no plausible action, it takes a second look. There are no generic grass or cat backups. Each best guess uses the drawing’s own content; a technical failure displays an error. App installation and PowerShell still require their respective Settings toggles to be enabled before you submit the drawing.
5. The sketchpad minimizes, returning focus to the previous window. Shortcuts affect that window. Creative actions leave the opened app or website in front. Results and timing remain in the main app.

## What it can do

- Open Chrome, Firefox, Spotify, Discord, VS Code, VLC, Notepad, Calculator, Paint, and Explorer.
- Open HTTP/HTTPS URLs.
- Close/new tab, undo/redo, save, copy/paste, select all, switch windows, show desktop, volume controls.
- With **Install missing apps** enabled, install supported missing third-party apps through exact Winget IDs. Windows may request elevation or installer interaction. After installation, draw the logo again to launch it.
- With **Full computer control** enabled, execute AI-generated PowerShell with your current Windows permissions. This enables broader tasks beyond the built-in actions. It is unrestricted code execution and runs automatically after recognition when you click **Make it happen**.

**Stop actions** or **Ctrl+Alt+Backspace** cancels drawing recognition, terminates the current command tree, and stops subsequent steps. It cannot undo completed actions or terminate an already detached application/installer. Commands time out after three minutes; local recognition after five minutes. The global shortcut works while the sketchpad is minimized; another application may reserve it on some systems.

This is a hackathon prototype: one interpreted plan per drawing, not a screenshot-driven autonomous agent. Keyboard targeting depends on which window regains focus. It does not bypass OS permissions. App discovery uses Start-menu entries then executable lookup; unusual installs may need manual launching.

## Development

```powershell
npm test
npm run check
npm run dist -- --config.compression=store
```

The last command builds a portable Windows executable under `dist/` (unsigned). Electron isolates the renderer with a sandboxed preload and a narrow IPC bridge. The main process validates plans and retains the executable plan rather than accepting scripts from the renderer. Full control and app installation are opt-in per session.

Files: `src/agent.js` (vision and validation), `src/comedy.js` (explicit money shortcut), `src/gestures.js` (instant X and dollar recognition), `src/native-host.*` (persistent Windows input helper), `src/overlay.*` (screen drawing), `src/local-ai.js` (local server and warmup), `src/main.js` (desktop lifecycle and execution), `src/renderer.js` (main canvas and UI). No hosted backend required.

Integrations follow the [Ollama chat API](https://docs.ollama.com/api/chat) and [OpenAI image-input documentation](https://developers.openai.com/api/docs/guides/images-vision).

