# RAMGuard

> **RAMGuard automatically hibernates inactive tabs after 1 minute — so Chromium-based browsers (Chrome, Brave, Edge, Opera, Vivaldi) stay fast and responsive even when you have 100+ tabs open. 100% free.**

---

### Description

Tired of your browser becoming slow and laggy with 100+ tabs open?

RAMGuard automatically puts inactive tabs to sleep after just 1 minute, dramatically reducing RAM usage and eliminating lag, fan noise, and slowdowns on all Chromium-based browsers (including Google Chrome, Brave, Microsoft Edge, Opera, and Vivaldi).

* **One-click “Hibernate Now” button + global hotkey**
* **Shows exactly how much RAM you’ve saved**
* **Clean, modern interface**

Perfect for heavy tab users who actually want their browser to stay fast. **100% free. No bloat. No tracking.**

---

## Features

* **Auto-Inactivity Hibernation**: Automatically discards background tabs that have been idle for a customizable duration (defaults to 1 minute).
* **Tab Limit Enforcement**: If total active open tabs exceed 20, RAMGuard automatically hibernates the oldest inactive tabs until the count is 20 or less.
* **Global Hotkey Support**: Press `Ctrl+Shift+H` (or `Cmd+Shift+H` on Mac) to instantly hibernate all eligible background tabs.
* **RAM Threshold Protection**: Sets a virtual threshold (e.g., 4.0 GB). When estimated memory usage from active tabs exceeds this limit, RAMGuard discards the oldest inactive tabs first to prevent browser slow-downs.
* **Window Profiles**: Apply different inactivity thresholds and timers for different browser windows (e.g., set 1 minute for your research window, and 15 minutes for your work window).
* **Sleeping Tabs View**: Access all currently hibernated tabs, with options to wake them in the background, focus them, or wake all tabs in a single click.
* **Hibernation History**: Access a scrollable history log of the last 10 hibernated tabs to reopen tabs that were discarded.
* **Stable Integration**: Built using standard extension APIs (`chrome.tabs.discard()`), ensuring compatibility with all stable releases of Chromium-based browsers without requiring unstable experimental flags.

---

## Installation

RAMGuard works on all Chromium-based browsers (Google Chrome, Brave, Microsoft Edge, Opera, Vivaldi, etc.).

### Generic Installation Steps:
1. Clone or download this repository.
2. Open your browser and navigate to the Extensions page:
   - **Chrome**: `chrome://extensions/`
   - **Brave**: `brave://extensions/`
   - **Edge**: `edge://extensions/`
   - **Opera**: `opera://extensions/` (or `chrome://extensions/`)
   - **Vivaldi**: `vivaldi://extensions/` (or `chrome://extensions/`)
3. Enable **Developer mode** (usually a toggle in the top-right or side menu).
4. Click on **Load unpacked** in the top left.
5. Select the extension directory containing `manifest.json`.

---

## Production Packaging

To pack the extension for distribution, zip the folder contents using the terminal command:
```bash
zip -r ramguard-v1.6.3.zip manifest.json background.js popup icons PRIVACY.md README.md
```
*(Run from inside the `ramguard` directory)*
