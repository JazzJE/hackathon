# ✳ Doodle Do

**Bad drawings. Real consequences.** A Windows desktop app that turns sketches into computer actions. Draw a tab with an X to close a tab, a Spotify logo to open Spotify, or a more elaborate idea to generate a PowerShell plan.

## Run

Windows 10/11, Node.js 22+ and npm are required.

```powershell
npm install
npm start
```

Open Settings and enter an OpenAI API key. You can also set `OPENAI_API_KEY` before starting. The default vision model is `gpt-4.1-mini`; change it in Settings to another image-capable Responses API model available to your account. The key stays in the main process/request flow and session memory; it is never saved to disk by this app. API usage is billed to your account.

Try the three example cards without an API key. These load **preset demo plans**, not AI recognition. Click **Run this plan** for a real computer action.

## The loop

1. Draw using mouse, pen, or touch. Undo, erase, clear, and adjust brush size.
2. Optionally add a hint. Click **Make it happen**.
3. The drawing and hint go to OpenAI's Responses API. The AI returns a title, explanation, confidence, and up to eight actions. No screenshots or other computer data are sent.
4. Inspect the plan, then run it. Low-confidence plans cannot execute.
5. The sketchpad minimizes, returning focus to the previous window. Shortcuts affect that window. A result appears when execution finishes.

## What it can do

- Open Chrome, Firefox, Spotify, Discord, VS Code, VLC, Notepad, Calculator, Paint, and Explorer.
- Open HTTP/HTTPS URLs.
- Close/new tab, undo/redo, save, copy/paste, select all, switch windows, show desktop, volume controls.
- With **Install missing apps** enabled, install supported missing third-party apps through exact Winget IDs. Windows may request elevation or installer interaction. After installation, draw the logo again to launch it.
- With **Full computer control** enabled, execute AI-generated PowerShell with your current Windows permissions. This enables broader tasks beyond the built-in actions. It is unrestricted code execution, so read the displayed script before running it.

**Stop actions** or **Ctrl+Alt+Backspace** terminates the current command tree and stops subsequent steps. It cannot undo completed actions or terminate an already detached application/installer. Commands time out after three minutes. The global shortcut works while the sketchpad is minimized; Windows may reserve it on some systems, so test availability on yours.

This is a hackathon prototype: one interpreted plan per drawing, not a screenshot-driven autonomous agent. Keyboard targeting depends on which window regains focus. It does not bypass OS permissions. App discovery uses Start-menu entries then executable lookup; unusual installs may need manual launching.

## Development

```powershell
npm test
npm run check
npm run dist
```

The last command builds a portable Windows executable under `dist/` (unsigned). Electron isolates the renderer with a sandboxed preload and a narrow IPC bridge. The main process validates plans and retains the executable plan rather than accepting scripts from the renderer. Full control and app installation are opt-in per session.

Files: `src/agent.js` (vision, validation, Windows command generation), `src/main.js` (desktop lifecycle and execution), `src/renderer.js` (canvas and UI). No backend service required.

Vision integration follows the [official OpenAI image-input documentation](https://developers.openai.com/api/docs/guides/images-vision).

