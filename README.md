# Soundboard

A static, browser based soundboard. Create library entries with a title, audio file, optional image icon, and playback settings, then choose up to 20 entries to show on the board. Each board card has a configurable keyboard shortcut and Cut-In, Fade-In, and Overlay playback modes. Click a card's key button, then press a letter or number (including numpad digits) to assign it immediately; Escape cancels. If the key belongs to another card, the two cards swap bindings. Shortcuts work while the board has focus, outside text fields and selectors. Ctrl, Alt, and Windows/Command combinations are not supported.

## Run locally

Open `index.html` in a modern browser, or serve this folder with any static web server. IndexedDB storage works on `localhost` and secure hosted origins.

On Windows, run `powershell -ExecutionPolicy Bypass -File .\start-preview.ps1` from this folder, then open `http://127.0.0.1:8000/`. The preview runs as a separate background Node.js process, so an idle Codex tool session cannot shut it down. Logs are written to `preview-server.log` and `preview-server.error.log`. Keep the same address and port to access your saved browser library.

## Hosting

The site has no build step or server dependency. Publish the repository root with GitHub Pages, then copy the same files to any static web host or personal server. Use relative asset paths so the site works from a project subpath on GitHub Pages.

## User audio storage

Uploaded audio and optional icons are stored in the visitor's browser using IndexedDB. Entry settings include background looping/resume, a start position, and playback volume. Board selection and entry settings are stored with each library entry; keyboard bindings and selected playback modes are saved in local browser storage. Nothing is uploaded to GitHub Pages or any server. The library belongs to that browser profile on that device; clearing site data or switching browsers removes access to it. Keep backups of original files.
