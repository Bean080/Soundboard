# Easy Audio

A static, browser based soundboard. Create library entries with a title, audio file, optional image icon, and playback settings, then choose up to 20 entries to show on the board. Each board card has a configurable keyboard shortcut and Cut-In, Fade-In, and Overlay playback modes. Click a card's key button, then press a letter or number (including numpad digits) to assign it immediately; Escape cancels. If the key belongs to another card, the two cards swap bindings. Shortcuts work while the board has focus, outside text fields and selectors. Ctrl, Alt, and Windows/Command combinations are not supported.

## Run locally

Open `index.html` in a modern browser, or serve this folder with any static web server. IndexedDB storage works on `localhost` and secure hosted origins.

On Windows, run `powershell -ExecutionPolicy Bypass -File .\start-preview.ps1` from this folder, then open `http://127.0.0.1:8000/`. The preview runs as a separate background Node.js process, so an idle Codex tool session cannot shut it down. Logs are written to `preview-server.log` and `preview-server.error.log`. Keep the same address and port to access your saved browser library.

## Hosting

The site has no build step or server dependency. Publish the repository root with GitHub Pages, then copy the same files to any static web host or personal server. Use relative asset paths so the site works from a project subpath on GitHub Pages.

## Windows desktop app

The desktop version runs locally using Electron and does not need the preview server or an internet connection. The initial Windows x64 installer is `dist/Easy-Audio-Setup-0.1.0.exe`. Run it and open Easy Audio from the Start menu or desktop shortcut.

Add your sounds in the desktop Library, select them for the board, and bind a letter, top-row number, or numpad digit. Turn **Global keys: On**, then minimize the app or switch to another application. The selected playback mode, trim, volume, and background settings still apply. Keep Easy Audio running; closing its main window exits the app and releases its shortcuts.

Global keys start off each time the app launches. While enabled and another app is focused, assigned keys are reserved by Easy Audio and may not type into that app. Turn Global Keys off to release them. Keys already reserved by another application are listed below the board heading. While either Easy Audio window is focused, global registration is released so that editing, rebinding, and local key playback work normally. The library opens in a separate window to keep the board available for background playback.

Desktop sounds and settings are stored in Electron's local application profile, separately from the browser's library. Re-add your original files for the desktop version. This app does not install a virtual audio device or automatically route audio into Discord.

To develop or rebuild with Node.js 22.12 or newer and npm installed:

```sh
npm ci
npm run desktop
npm run test:desktop
npm run desktop:build
```

The smoke check uses its own profile under `.cache/desktop-smoke-profile`. The Windows installer and unpacked app are built under `dist/`, which is excluded from Git. The current installer is unsigned; Windows may display an unknown-publisher warning. Public distribution should use a signed build. Installer releases can be hosted separately from GitHub Pages without adding binaries to the source repository.

## User audio storage

Uploaded audio and optional icons are stored in the visitor's browser using IndexedDB. Entry settings include background looping/resume, a start position, and playback volume. Board selection and entry settings are stored with each library entry; keyboard bindings and selected playback modes are saved in local browser storage. Nothing is uploaded to GitHub Pages or any server. The library belongs to that browser profile on that device; clearing site data or switching browsers removes access to it. Keep backups of original files.
