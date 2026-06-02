# RAMGuard

**RAMGuard** is a lightweight, privacy-first, and highly optimized Chrome Extension (Manifest V3) designed to hibernate inactive tabs and free up system memory (RAM) instantly. It operates completely client-side without any background external servers and is 100% free forever.

---

## Features

* **Auto-Inactivity Hibernation**: Automatically discards background tabs that have been idle for a customizable duration (defaults to 1 minute).
* **Tab Limit Enforcement**: If total active open tabs exceed 20, RAMGuard automatically hibernates the oldest inactive tabs until the count is 20 or less.
* **Global Hotkey Support**: Press `Ctrl+Shift+H` (or `Cmd+Shift+H` on Mac) to instantly hibernate all eligible background tabs.
* **RAM Threshold Protection**: Sets a virtual threshold (e.g., 4.0 GB). When estimated memory usage from active tabs exceeds this limit, RAMGuard discards the oldest inactive tabs first to prevent browser slow-downs.
* **Window Profiles**: Apply different inactivity thresholds and timers for different browser windows (e.g., set 1 minute for your research window, and 15 minutes for your work window).
* **Sleeping Tabs View**: Access all currently hibernated tabs, with options to wake them in the background, focus them, or wake all tabs in a single click.
* **Hibernation History**: Access a scrollable history log of the last 10 hibernated tabs to reopen tabs that were discarded.
* **Stable Integration**: Built using standard Chrome APIs (`chrome.tabs.discard()`), ensuring compatibility with all stable releases of Chrome without requiring unstable experimental flags.

---

## Installation

1. Clone or download this repository.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the upper right-hand corner).
4. Click on **Load unpacked** in the top left.
5. Select the `ramguard/` directory containing `manifest.json`.

---

## Production Packaging

To pack the extension for the Chrome Web Store, zip the folder contents using the terminal command:
```bash
zip -r ramguard-v1.3.0.zip ramguard/ -x "*.git*"
```
*(Run from the parent directory of `ramguard`)*
