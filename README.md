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

Open **Settings**, choose **Google Gemini**, and paste a key from [Google AI Studio](https://aistudio.google.com/apikey). New sessions default to `gemini-3.8-flash`, which has a [free tier](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash), subject to account eligibility and quotas. Keep the project on Free Tier; the app never enables billing or falls back to a paid provider. A Gemini Pro subscription has separate API access and limits.

The Settings **Get a free-tier Gemini key** button opens the official API-key page. Create or select a project, create a key, copy it, paste it in Settings, and save. Account sign-in, terms acceptance, and key creation happen on Google's site; no account credentials are shared with this app. Do not post API keys in chats or commit them to git.

You can also set `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) before launching. **OpenAI** remains available in the provider selector with `gpt-4.1-mini`; `OPENAI_API_KEY` is still supported. If only an OpenAI environment key is present, the app preserves that provider. `DOODLE_PROVIDER=gemini` or `openai` explicitly selects one. Each provider keeps its own model and key for the session; switching cannot send one provider's key to the other.

Keys stay in the main process for this session and are never written to disk. Blank key fields preserve the selected provider's saved session key. **Forget session key** clears only that provider's key, including one originally loaded from the environment. OpenAI API usage is paid separately from ChatGPT subscriptions.

Without a key, four labeled preset demos let you try drawing tools, plan previews, rehearsal, and real built-in actions. These are not AI recognition.

## Draw on your desktop

1. Press **⌘ Shift D** on macOS or **Ctrl Shift D** on Windows, even when another app is in front. You can also click **Draw on desktop**. If the OS reserves the shortcut, the launch button still works.
2. A frameless overlay covers the display under your pointer. Its translucent surface shows a **frozen screenshot**, so the scene stays still while you draw.
3. Draw over the actual targets. Circle files and draw a trashcan with an arrow; draw an X on a tab; or divide the screen into boxes and put app logos inside them.
4. Click the green **Done** button at the top right, or press **⌘/Ctrl Enter**. **Tab** hides/restores the tools if they cover something you need to mark. **Esc** cancels without sending a request.
5. Review the interpreted actions and **Review marked desktop**. The preview combines the screenshot, your drawing, and green click targets or window regions.
6. **Rehearsal mode** is on by default: play through the steps without touching the desktop. Turn it off and run the same reviewed plan for real.

Desktop mode sends the screenshot of the selected display, the drawing, installed app names and IDs, and up to 300 non-hidden desktop item names to the selected AI provider **only when you press Done**. It does not stream the screen. Captures stay in session memory and are not added to the sketch gallery or saved to disk. OpenAI requests use `store: false`. Google free-tier submissions may be used to improve Google products; avoid capturing private desktop content when using that tier.

### Three competition tricks

- **Tab eviction:** mark an X over one visible browser tab. The model can click that specific tab’s close button instead of closing whichever tab happens to be active.
- **Artistic housekeeping:** circle visible desktop files and point a drawn trashcan at them. The review lists exact names. Doodle Do checks that each item was present at capture time and has not changed, then calls the OS Trash / Recycle Bin API. It does not run a deletion script or empty the bin. This supports items directly on the desktop, including folders; it does not trash files inside arbitrary Finder / Explorer windows.
- **A very indirect window manager:** draw a left and right region with a Chrome logo in one and a Spotify logo in the other. The plan launches those apps and requests their positions and sizes. Regions follow the drawing; menu bars and docks are excluded when placing windows. Apps can enforce minimum sizes or refuse resizing. Use each app in one region per plan.

Target locations belong to the captured display, including its offset and scaling. Real spatial plans expire after two minutes or when the display geometry changes. **Keep the target windows in place between drawing and execution**; this is a one-shot plan, not a live screen-tracking agent.

### macOS permissions

The desktop overlay needs **Screen Recording** permission for Electron during development, or Doodle Do when packaged. Keyboard shortcuts, clicking, and window arrangement need **Accessibility** permission. Enable these in **System Settings → Privacy & Security**, then restart if macOS requests it. When launched from a terminal, IDE, or this chat, macOS can attribute Screen Recording and Accessibility to that launcher instead of Electron. If Electron is enabled but the app still reports denial, check the launching app's permission and restart Doodle Do. The app reports capture or automation errors; it does not bypass permissions.

## The sketchpad

Draw with mouse, pen, or touch. Choose four inks, brush size, pen or transparent eraser, undo and redo. **B** selects the pen, **E** the eraser, and **⌘/Ctrl Z** undoes a stroke (**Shift** redoes it).

Add an optional hint and click **Read my doodle**. The sketchpad sends the drawing, optional hint and app catalog names/IDs, not a screenshot. Changing a stroke, hint, or settings invalidates the previous plan.

- **Deal me a challenge** gives you a random prompt and 30 seconds, starting with your first stroke. The timer never locks the canvas.
- The **session sketchbook** remembers up to eight sketchpad guesses. Restoring a sketch requires a fresh interpretation; it cannot run a stale plan. It is cleared when the app closes.
- The inspector shows whether a plan is a preset or AI interpretation, model confidence, readable actions, and exact scripts or file names where relevant. Low-confidence or empty plans cannot run.

## Desktop actions

Doodle Do discovers installed apps at startup instead of using a fixed app whitelist. On macOS it scans `/Applications`, `~/Applications`, `/System/Applications` and system app bundles; on Windows it uses Start-menu app registrations. **Settings → Installed apps** shows the count, **Refresh app list** picks up new installs, and **Add an app…** includes `.app` bundles or Windows executables stored elsewhere. Only an app selected from this local catalog can be launched; the model cannot invent an executable path. App names and catalog IDs are sent to the selected AI provider for matching; local executable paths stay on your computer.

If no installed app fits a recognizable drawing, Doodle Do proposes its official website or a Google search for the related topic. It prefers installed apps, uses search when the exact website is uncertain, and shows the destination or query before execution. Searches and sites open in your default browser. An unclear drawing still asks for a clearer mark. Website fallbacks do not apply drawn window sizes.

Built-in actions open catalog apps and HTTP/HTTPS URLs, search Google, send known shortcuts, target a screen location, move named desktop items to Trash, and arrange app windows. macOS layouts identify the target process by its bundle ID, including Messages and third-party apps. Windows launches use exact registered AppIDs; placement requires a matching top-level app window. Some apps do not expose resizable windows or enforce minimum sizes.

Gemini 3 requests use low reasoning effort for quicker recognition. The waiting view displays elapsed seconds and a Stop option; the inspector reports the measured interpretation time. Provider load can still cause delays.

Use **Link color** (keys **1–5**) to draw each app’s circle, arrow and destination box in the same color. Different colors keep different app placements grouped; color itself does not choose an app. Colors survive undo, redo and editing. Use **Circle** to select an icon and **Box** to draw window regions; both support reverse-direction drags, undo and redo. Add an optional hint directly in the overlay. After interpretation, **Choose a different app** corrects a launch or layout instantly, retaining its drawn position and size without another AI call. **Edit marks** restores your strokes and hint on the captured desktop; **Try again** retries the same drawing after an API error. Desktop captures still expire after two minutes, so open a fresh canvas if the display or windows have changed.

On macOS, Settings shows current Screen Recording and Accessibility status with buttons to open the matching system panels. Development launches can inherit permissions from their launcher, such as ChatGPT or Terminal. Missing Accessibility access preserves the reviewed plan so you can retry after enabling it.

Windows-only, opt-in settings retain the original prototype’s **Install missing apps** through exact Winget IDs and **Full computer control** for AI-written PowerShell. Custom scripts are disabled for desktop-overlay interpretation; overlay actions use the typed built-in commands. Inspect scripts before running them. Installing a missing app can require interaction; launch it again after installation completes.

**Stop** or **⌘/Ctrl Alt Backspace** cancels recognition, terminates the running command tree, and prevents later steps. It cannot undo completed actions or an already detached app launch. A Trash operation already in progress may finish before stopping; subsequent items are skipped. Commands time out after three minutes. Global shortcut availability is shown in the interface.

## Development and verification

```sh
npm test
npm run check
npm run smoke
npm run smoke:gemini
npm run dist
```

`npm run smoke` (OpenAI mock) and `npm run smoke:gemini` (Gemini mock) launch Electron and checks the UI, rehearsal, cancellation, stale-plan rejection, drawing/erasing, undo/redo, gallery, challenges, and desktop overlay. It uses a screenshot of the app itself as an overlay fixture: **no actual desktop capture, API call, file move, click, or window resize**. Unit tests exercise normalized target coordinates, display offsets, app/window bounds, structured API output, Trash preflight, and path rejection with a mocked Trash API.

`npm run dist` builds an unsigned portable Windows executable under `dist/`. Run the source directly on macOS; a signed macOS installer is not included. Automated checks do not verify OS-specific automation against live apps or real model accuracy. Rehearse a few drawings on the competition computer before presenting.

Electron uses a sandboxed preload, context isolation, and a narrow IPC bridge. The main process retains the executable plan, capture geometry, desktop inventory, and API key. The renderer does not supply arbitrary executable scripts to the execution handler.

Key files: `src/agent.js` (vision and commands), `src/desktop.js` (coordinates, layouts and Trash checks), `src/main.js` (lifecycle, capture, IPC and execution), `src/overlay.*` (desktop drawing), `src/renderer.js` (sketchpad and plan review).

Gemini uses inline image inputs and JSON-schema output as documented in the official [Gemini image guide](https://ai.google.dev/gemini-api/docs/image-understanding) and [structured-output guide](https://ai.google.dev/gemini-api/docs/generate-content/structured-output). OpenAI vision plans follow the official [OpenAI Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). Capture uses Electron’s [desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer).
