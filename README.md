# ✳ Doodle Do

**Bad art. Real power.** An intentionally impractical Windows and macOS desktop app: draw a command, let vision AI guess the intent, review the plan, and make your computer do it.

This version lives on **`improvements`**. The original remains on **`main`**.

## Start

Requires Node.js 22.12+ and npm.

```sh
git switch improvements
npm ci
npm start
```

Open **Settings** and add an OpenAI API key, or set `OPENAI_API_KEY` before launching. The default image-capable model is `gpt-4.1-mini`; you can change it in Settings. API requests are billed to your account. Keys stay in the main process for this session and are never written to disk. **Forget session key** removes the current key, including one originally provided through the environment.

Without a key, four labeled preset demos let you try drawing tools, plan previews, rehearsal, and real built-in actions. These are not AI recognition.

## Draw on your desktop

1. Press **⌘ Shift D** on macOS or **Ctrl Shift D** on Windows, even when another app is in front. You can also click **Draw on desktop**. If the OS reserves the shortcut, the launch button still works.
2. A frameless overlay covers the display under your pointer. Its translucent surface shows a **frozen screenshot**, so the scene stays still while you draw.
3. Draw over the actual targets. Circle files and draw a trashcan with an arrow; draw an X on a tab; or divide the screen into boxes and put app logos inside them.
4. Click the green **Done** button at the top right, or press **⌘/Ctrl Enter**. **Tab** hides/restores the tools if they cover something you need to mark. **Esc** cancels without sending a request.
5. Review the interpreted actions and **Review marked desktop**. The preview combines the screenshot, your drawing, and green click targets or window regions.
6. **Rehearsal mode** is on by default: play through the steps without touching the desktop. Turn it off and run the same reviewed plan for real.

Desktop mode sends the screenshot of the selected display, the drawing, and up to 300 non-hidden desktop item names to OpenAI **only when you press Done**. It does not stream the screen. Captures stay in session memory and are not added to the sketch gallery or saved to disk. The API request uses `store: false`.

### Three competition tricks

- **Tab eviction:** mark an X over one visible browser tab. The model can click that specific tab’s close button instead of closing whichever tab happens to be active.
- **Artistic housekeeping:** circle visible desktop files and point a drawn trashcan at them. The review lists exact names. Doodle Do checks that each item was present at capture time and has not changed, then calls the OS Trash / Recycle Bin API. It does not run a deletion script or empty the bin. This supports items directly on the desktop, including folders; it does not trash files inside arbitrary Finder / Explorer windows.
- **A very indirect window manager:** draw a left and right region with a Chrome logo in one and a Spotify logo in the other. The plan launches those apps and requests their positions and sizes. Regions follow the drawing; menu bars and docks are excluded when placing windows. Apps can enforce minimum sizes or refuse resizing. Use each app in one region per plan.

Target locations belong to the captured display, including its offset and scaling. Real spatial plans expire after two minutes or when the display geometry changes. **Keep the target windows in place between drawing and execution**; this is a one-shot plan, not a live screen-tracking agent.

### macOS permissions

The desktop overlay needs **Screen Recording** permission for Electron during development, or Doodle Do when packaged. Keyboard shortcuts, clicking, and window arrangement need **Accessibility** permission. Enable these in **System Settings → Privacy & Security**, then restart if macOS requests it. The app reports capture or automation errors; it does not bypass permissions.

## The sketchpad

Draw with mouse, pen, or touch. Choose four inks, brush size, pen or transparent eraser, undo and redo. **B** selects the pen, **E** the eraser, and **⌘/Ctrl Z** undoes a stroke (**Shift** redoes it).

Add an optional hint and click **Read my doodle**. The sketchpad sends only the drawing and hint, not a screenshot. Changing a stroke, hint, or settings invalidates the previous plan.

- **Deal me a challenge** gives you a random prompt and 30 seconds, starting with your first stroke. The timer never locks the canvas.
- The **session sketchbook** remembers up to eight sketchpad guesses. Restoring a sketch requires a fresh interpretation; it cannot run a stale plan. It is cleared when the app closes.
- The inspector shows whether a plan is a preset or AI interpretation, model confidence, readable actions, and exact scripts or file names where relevant. Low-confidence or empty plans cannot run.

## Desktop actions

Built-in actions open supported apps and HTTP/HTTPS URLs, send known shortcuts, target a screen location, move named desktop items to Trash, and arrange app windows. macOS includes Safari, TextEdit, Finder, Chrome, Firefox, Spotify, Discord, VS Code, VLC, and Calculator. Windows includes Chrome, Firefox, Spotify, Discord, VS Code, VLC, Notepad, Calculator, Paint, and Explorer.

Windows-only, opt-in settings retain the original prototype’s **Install missing apps** through exact Winget IDs and **Full computer control** for AI-written PowerShell. Custom scripts are disabled for desktop-overlay interpretation; overlay actions use the typed built-in commands. Inspect scripts before running them. Installing a missing app can require interaction; launch it again after installation completes.

**Stop** or **⌘/Ctrl Alt Backspace** cancels recognition, terminates the running command tree, and prevents later steps. It cannot undo completed actions or an already detached app launch. A Trash operation already in progress may finish before stopping; subsequent items are skipped. Commands time out after three minutes. Global shortcut availability is shown in the interface.

## Development and verification

```sh
npm test
npm run check
npm run smoke
npm run dist
```

`npm run smoke` launches Electron and checks the UI, rehearsal, cancellation, stale-plan rejection, drawing/erasing, undo/redo, gallery, challenges, and desktop overlay. It uses a screenshot of the app itself as an overlay fixture: **no actual desktop capture, API call, file move, click, or window resize**. Unit tests exercise normalized target coordinates, display offsets, app/window bounds, structured API output, Trash preflight, and path rejection with a mocked Trash API.

`npm run dist` builds an unsigned portable Windows executable under `dist/`. Run the source directly on macOS; a signed macOS installer is not included. Automated checks do not verify OS-specific automation against live apps or real model accuracy. Rehearse a few drawings on the competition computer before presenting.

Electron uses a sandboxed preload, context isolation, and a narrow IPC bridge. The main process retains the executable plan, capture geometry, desktop inventory, and API key. The renderer does not supply arbitrary executable scripts to the execution handler.

Key files: `src/agent.js` (vision and commands), `src/desktop.js` (coordinates, layouts and Trash checks), `src/main.js` (lifecycle, capture, IPC and execution), `src/overlay.*` (desktop drawing), `src/renderer.js` (sketchpad and plan review).

Vision plans follow the official [OpenAI Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). Capture uses Electron’s [desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer).
