// content.js
// Runs in the ISOLATED world of the tab. Communicates with main-world.js and background.js.

let mainWorldState = {
  hasActiveWebRTC: false,
  hasActiveNetwork: false,
  hasBeforeUnload: false
};

// Listen for messages from main-world.js
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data && event.data.type === 'RAMGUARD_STATE_UPDATE') {
    mainWorldState.hasActiveWebRTC = !!event.data.hasActiveWebRTC;
    mainWorldState.hasActiveNetwork = !!event.data.hasActiveNetwork;
    mainWorldState.hasBeforeUnload = !!event.data.hasBeforeUnload;
  }
});

// Track changes to contenteditable elements
const initialContents = new WeakMap();

document.addEventListener('focusin', (e) => {
  const target = e.target;
  if (target && (target.hasAttribute('contenteditable') || target.getAttribute('contenteditable') === 'true')) {
    if (!initialContents.has(target)) {
      initialContents.set(target, target.innerHTML);
    }
  }
});

document.addEventListener('input', (e) => {
  const target = e.target;
  if (target && (target.hasAttribute('contenteditable') || target.getAttribute('contenteditable') === 'true')) {
    const initial = initialContents.get(target);
    if (initial !== undefined && target.innerHTML !== initial) {
      target.dataset.dirty = 'true';
    } else {
      delete target.dataset.dirty;
    }
  }
});

// Helper to check standard form inputs, textareas, and selects for unsaved changes
function hasUnsavedChangesInDOM() {
  // Inputs: text, number, email, password, search, etc.
  const inputs = document.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea');
  for (const input of inputs) {
    if (input.value !== input.defaultValue) {
      if (input.value.trim() !== input.defaultValue.trim()) {
        return true;
      }
    }
  }

  // Select elements
  const selects = document.querySelectorAll('select');
  for (const select of selects) {
    for (const option of select.options) {
      if (option.selected !== option.defaultSelected) {
        return true;
      }
    }
  }

  // Contenteditable elements
  const editables = document.querySelectorAll('[contenteditable="true"], [contenteditable=""]');
  for (const el of editables) {
    if (el.dataset.dirty === 'true') {
      return true;
    }
  }

  return false;
}

// Listen for query messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.command === 'check-protection') {
    const unsavedDOM = hasUnsavedChangesInDOM();
    const unsavedBeforeUnload = mainWorldState.hasBeforeUnload;
    const isProtected = unsavedDOM || unsavedBeforeUnload || mainWorldState.hasActiveWebRTC || mainWorldState.hasActiveNetwork;

    sendResponse({
      isProtected: !!isProtected,
      hasUnsavedChanges: !!(unsavedDOM || unsavedBeforeUnload),
      hasActiveWebRTC: !!mainWorldState.hasActiveWebRTC,
      hasActiveNetwork: !!mainWorldState.hasActiveNetwork
    });
  }
});
