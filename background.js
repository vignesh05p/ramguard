// RAMGuard Background Service Worker (Manifest V3)
// Handles automatic tab hibernation, threshold policing, history tracking, and global hotkeys.

const DEFAULT_INACTIVE_MINUTES = 1;
const DEFAULT_THRESHOLD_GB = 4.0;
const ESTIMATED_ACTIVE_TAB_RAM_MB = 150;
const ESTIMATED_DISCARDED_TAB_RAM_MB = 10;

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('[RAMGuard] Installed/Updated successfully.');
  chrome.storage.local.get(
    ['hibernateInactiveMinutes', 'thresholdGB', 'hibernationHistory', 'totalHibernatedCount'],
    (data) => {
      if (chrome.runtime.lastError) {
        console.error('[RAMGuard] Error getting storage in onInstalled:', chrome.runtime.lastError);
        return;
      }
      const safeData = data || {};
      const updates = {};
      if (safeData.hibernateInactiveMinutes === undefined) {
        updates.hibernateInactiveMinutes = DEFAULT_INACTIVE_MINUTES;
      }
      if (safeData.thresholdGB === undefined) {
        updates.thresholdGB = DEFAULT_THRESHOLD_GB;
      }
      if (safeData.hibernationHistory === undefined) {
        updates.hibernationHistory = [];
      }
      if (safeData.totalHibernatedCount === undefined) {
        updates.totalHibernatedCount = 0;
      }
      if (Object.keys(updates).length > 0) {
        chrome.storage.local.set(updates, () => {
          if (chrome.runtime.lastError) {
            console.error('[RAMGuard] Error setting initial storage:', chrome.runtime.lastError);
          }
        });
      }
    }
  );

  // Setup periodic check alarm
  chrome.alarms.create('checkInactive', { periodInMinutes: 1 });
});

// Alarm Listener
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'checkInactive') return;
  console.log('[RAMGuard] Running scheduled inactivity, RAM threshold, and tab limit checks...');
  try {
    await runInactivityCheck();
    await runThresholdCheck();
    await enforceTabLimit();
  } catch (error) {
    console.error('[RAMGuard] Error during scheduled check:', error);
  }
});

// Command Listener (Global Hotkey)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'hibernate-now') {
    console.log('[RAMGuard] Hibernate Now hotkey triggered');
    try {
      await hibernateAllEligible();
    } catch (error) {
      console.error('[RAMGuard] Error during hotkey hibernation:', error);
    }
  }
});

// Clean up window profile settings when windows are closed to prevent memory leaks
chrome.windows.onRemoved.addListener((windowId) => {
  const profileKey = `window_inactive_minutes_${windowId}`;
  chrome.storage.local.remove(profileKey, () => {
    if (chrome.runtime.lastError) {
      console.error('[RAMGuard] Error removing window profile setting:', chrome.runtime.lastError);
    } else {
      console.log(`[RAMGuard] Cleaned up profile for closed window ${windowId}`);
    }
  });
});

// Enforce tab limit immediately on tab creation
chrome.tabs.onCreated.addListener(() => {
  enforceTabLimit().catch(err => {
    console.error('[RAMGuard] Error in onCreated tab limit enforcement:', err);
  });
});

// Track discards for history (triggered by our discards or Chrome's native discards)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.discarded === true) {
    console.log(`[RAMGuard] Tab discarded: "${tab.title}" (${tab.url})`);
    logHibernation(tab);
  }
});

// Message Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.command === 'hibernate-now') {
    hibernateAllEligible()
      .then(() => sendResponse({ success: true }))
      .catch((err) => {
        console.error('[RAMGuard] Error handling manual hibernation message:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep message channel open for async response
  }

  if (message.command === 'wake-all') {
    wakeAllTabs(message.windowId)
      .then((count) => sendResponse({ success: true, count }))
      .catch((err) => {
        console.error('[RAMGuard] Error handling wake all message:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
});

// --- HELPER FUNCTIONS ---

// Log a hibernation event to storage
function logHibernation(tab) {
  chrome.storage.local.get(['hibernationHistory', 'totalHibernatedCount'], (data) => {
    if (chrome.runtime.lastError) {
      console.error('[RAMGuard] Error getting storage in logHibernation:', chrome.runtime.lastError);
      return;
    }
    const safeData = data || {};
    let history = safeData.hibernationHistory || [];
    const totalCount = (safeData.totalHibernatedCount || 0) + 1;
    
    // Add new entry
    const entry = {
      id: Math.random().toString(36).substring(2, 9),
      title: tab.title || 'Untitled Tab',
      url: tab.url || '',
      favIconUrl: tab.favIconUrl || '',
      timestamp: Date.now(),
      windowId: tab.windowId
    };

    history.unshift(entry);

    // Keep history clean: filter out entries older than 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    history = history.filter(item => item.timestamp > thirtyDaysAgo);

    // Cap history size to last 10 entries
    const limit = 10;
    if (history.length > limit) {
      history = history.slice(0, limit);
    }

    chrome.storage.local.set({
      hibernationHistory: history,
      totalHibernatedCount: totalCount,
      lastHibernationTime: Date.now()
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('[RAMGuard] Error saving hibernation history:', chrome.runtime.lastError);
      } else {
        console.log(`[RAMGuard] Logged discard to history. Total count: ${totalCount}`);
      }
    });
  });
}

// Inactivity Hibernation logic
async function runInactivityCheck() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(null, async (settings) => {
      if (chrome.runtime.lastError) {
        console.error('[RAMGuard] Error getting storage in runInactivityCheck:', chrome.runtime.lastError);
        return resolve();
      }
      const safeSettings = settings || {};
      try {
        const globalInactiveMinutes = safeSettings.hibernateInactiveMinutes || DEFAULT_INACTIVE_MINUTES;

        const tabs = await chrome.tabs.query({ active: false, discarded: false, pinned: false });
        let discardedCount = 0;

        for (const tab of tabs) {
          // Check if there is a window-specific profile
          let thresholdMinutes = globalInactiveMinutes;
          const windowKey = `window_inactive_minutes_${tab.windowId}`;
          if (safeSettings[windowKey] !== undefined) {
            thresholdMinutes = safeSettings[windowKey];
          }

          const cutoff = Date.now() - thresholdMinutes * 60 * 1000;
          if (tab.lastAccessed < cutoff) {
            await chrome.tabs.discard(tab.id);
            discardedCount++;
          }
        }

        if (discardedCount > 0) {
          console.log(`[RAMGuard] Auto-hibernated ${discardedCount} inactive tabs.`);
        }
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}

// Threshold Hibernation logic
async function runThresholdCheck() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['thresholdGB'], async (data) => {
      if (chrome.runtime.lastError) {
        console.error('[RAMGuard] Error getting storage in runThresholdCheck:', chrome.runtime.lastError);
        return resolve();
      }
      const safeData = data || {};
      try {
        const thresholdGB = safeData.thresholdGB || DEFAULT_THRESHOLD_GB;
        const allTabs = await chrome.tabs.query({});
        
        const activeTabs = allTabs.filter(t => !t.discarded);
        const discardedTabs = allTabs.filter(t => t.discarded);

        // Estimate current RAM usage of all tabs
        const estRAM_MB = (activeTabs.length * ESTIMATED_ACTIVE_TAB_RAM_MB) + 
                          (discardedTabs.length * ESTIMATED_DISCARDED_TAB_RAM_MB);
        const estRAM_GB = estRAM_MB / 1024;

        console.log(`[RAMGuard] Current Estimated Tab RAM: ${estRAM_GB.toFixed(2)} GB / Limit: ${thresholdGB} GB`);

        if (estRAM_GB > thresholdGB) {
          console.log(`[RAMGuard] Estimated RAM (${estRAM_GB.toFixed(2)} GB) exceeds threshold (${thresholdGB} GB). Freeing up RAM...`);
          
          // Get candidate tabs for hibernation: not discarded, not pinned, not active in their windows
          const candidates = allTabs.filter(t => !t.discarded && !t.pinned && !t.active);
          
          // Sort candidates by last accessed time (oldest first)
          candidates.sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0));

          let currentEstRAM_GB = estRAM_GB;
          let hibernatedCount = 0;

          for (const tab of candidates) {
            if (currentEstRAM_GB <= thresholdGB) break;
            
            await chrome.tabs.discard(tab.id);
            hibernatedCount++;
            
            // Recalculate RAM (moving tab from active to discarded saves ~140MB)
            currentEstRAM_GB -= (ESTIMATED_ACTIVE_TAB_RAM_MB - ESTIMATED_DISCARDED_TAB_RAM_MB) / 1024;
          }

          if (hibernatedCount > 0) {
            console.log(`[RAMGuard] Threshold breached. Hibernated ${hibernatedCount} oldest inactive tabs. New Estimated RAM: ${currentEstRAM_GB.toFixed(2)} GB`);
          }
        }
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}

// Enforce that open (active, non-discarded) tabs do not exceed 20
async function enforceTabLimit() {
  try {
    const allTabs = await chrome.tabs.query({ discarded: false });
    if (allTabs.length > 20) {
      console.log(`[RAMGuard] Total open tabs (${allTabs.length}) exceeds 20. Enforcing limit...`);
      
      // Candidate tabs to hibernate: not active in their window, not pinned, not discarded
      const candidates = allTabs.filter(t => !t.active && !t.pinned);
      
      // Sort candidates by last accessed time (oldest first)
      candidates.sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0));
      
      let openActiveCount = allTabs.length;
      let hibernatedCount = 0;
      
      for (const tab of candidates) {
        if (openActiveCount <= 20) break;
        try {
          await chrome.tabs.discard(tab.id);
          hibernatedCount++;
          openActiveCount--;
        } catch (e) {
          console.warn(`[RAMGuard] Failed to discard tab ${tab.id}:`, e);
        }
      }
      
      if (hibernatedCount > 0) {
        console.log(`[RAMGuard] Enforced tab limit. Automatically hibernated ${hibernatedCount} oldest inactive tabs.`);
      }
    }
  } catch (error) {
    console.error('[RAMGuard] Error in enforceTabLimit:', error);
  }
}

// Hibernate all eligible tabs right now (used by popup button and global hotkey)
async function hibernateAllEligible() {
  const tabs = await chrome.tabs.query({ active: false, discarded: false, pinned: false });
  let count = 0;
  for (const tab of tabs) {
    try {
      await chrome.tabs.discard(tab.id);
      count++;
    } catch (e) {
      console.warn(`[RAMGuard] Failed to discard tab ${tab.id}:`, e);
    }
  }
  console.log(`[RAMGuard] Manually hibernated ${count} tabs.`);
  return count;
}

// Wake all tabs (or all tabs in a specific window)
async function wakeAllTabs(windowId = null) {
  const queryInfo = { discarded: true };
  if (windowId !== null) {
    queryInfo.windowId = windowId;
  }
  
  const tabs = await chrome.tabs.query(queryInfo);
  let count = 0;
  for (const tab of tabs) {
    try {
      await chrome.tabs.reload(tab.id);
      count++;
    } catch (e) {
      console.warn(`[RAMGuard] Failed to reload tab ${tab.id}:`, e);
    }
  }
  console.log(`[RAMGuard] Woke up ${count} tabs.`);
  return count;
}
