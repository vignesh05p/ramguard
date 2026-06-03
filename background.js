// RAMGuard v1.6.3 Background Service Worker (Manifest V3)
// Performance Optimized for high tab counts (50-100+ tabs) on Windows/Linux systems.

const DEFAULT_INACTIVE_MINUTES = 1;
const DEFAULT_THRESHOLD_GB = 4.0;
const ESTIMATED_ACTIVE_TAB_RAM_MB = 150;
const ESTIMATED_DISCARDED_TAB_RAM_MB = 10;

// Log Buffering/Debounce variables to prevent storage write thrashing
let pendingLogs = [];
let logDebounceTimeout = null;

// Helper to get today's date string in YYYY-MM-DD local format
function getTodayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Fast domain extraction without full URL instantiation to save CPU/garbage collection cycles
function getDomain(url) {
  if (!url) return '';
  let hostname = '';
  const protocolIndex = url.indexOf('://');
  if (protocolIndex > -1) {
    hostname = url.substring(protocolIndex + 3);
  } else {
    hostname = url;
  }
  const slashIndex = hostname.indexOf('/');
  if (slashIndex > -1) {
    hostname = hostname.substring(0, slashIndex);
  }
  const colonIndex = hostname.indexOf(':');
  if (colonIndex > -1) {
    hostname = hostname.substring(0, colonIndex);
  }
  const questionIndex = hostname.indexOf('?');
  if (questionIndex > -1) {
    hostname = hostname.substring(0, questionIndex);
  }
  if (hostname.startsWith('www.')) {
    hostname = hostname.substring(4);
  }
  return hostname.toLowerCase();
}

// Check if a URL's domain matches the ignore list
function isIgnored(url, ignoreList) {
  if (!url || !ignoreList || ignoreList.length === 0) return false;
  const domain = getDomain(url);
  if (!domain) return false;
  return ignoreList.some(ignored => {
    const lowerIgnored = ignored.trim().toLowerCase();
    if (!lowerIgnored) return false;
    return domain === lowerIgnored || domain.endsWith('.' + lowerIgnored);
  });
}

// Heuristic to estimate RAM saved for a specific URL
function estimateTabRAM(url) {
  if (!url) return 80;
  const domain = getDomain(url);
  
  // Heavy media/streaming sites
  const heavyMedia = ['youtube.com', 'netflix.com', 'twitch.tv', 'chatgpt.com', 'spotify.com', 'disneyplus.com', 'hulu.com', 'vimeo.com'];
  // Heavy document/collaboration sites
  const heavyDocs = ['google.com', 'notion.so', 'github.com', 'figma.com', 'microsoft.com', 'canva.com', 'jira.com', 'atlassian.net'];
  
  if (heavyMedia.some(d => domain === d || domain.endsWith('.' + d))) {
    return 120;
  }
  if (heavyDocs.some(d => domain === d || domain.endsWith('.' + d))) {
    return 100;
  }
  return 80;
}

// Check if a tab is eligible for hibernation
function isTabEligible(tab, ignoreList) {
  if (tab.pinned || tab.active || tab.audible) return false;
  if (!tab.url) return false;

  // Do not hibernate internal browser pages or invalid/restricted schemes
  try {
    const url = new URL(tab.url);
    const protocol = url.protocol.toLowerCase();
    // Only hibernate http, https, and file schemes
    if (protocol !== 'http:' && protocol !== 'https:' && protocol !== 'file:') {
      return false;
    }
  } catch (e) {
    // Fallback simple string checking if URL parsing fails
    const urlLower = tab.url.toLowerCase();
    if (
      !urlLower.startsWith('http://') &&
      !urlLower.startsWith('https://') &&
      !urlLower.startsWith('file://')
    ) {
      return false;
    }
  }

  if (isIgnored(tab.url, ignoreList)) return false;
  return true;
}

// Helper to execute tab actions in small chunks of concurrent operations
// to prevent overloading the browser process under high tab counts.
async function processInBatches(items, actionFn, batchSize = 5) {
  const startTime = Date.now();
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.allSettled(batch.map(actionFn));
  }
  const duration = Date.now() - startTime;
  if (items.length > 0) {
    console.log(`[RAMGuard Perf] Batch completed: ${items.length} operations processed in chunks of ${batchSize} in ${duration}ms.`);
  }
}

// Initialize storage settings
async function initStorage() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([
      'hibernateInactiveMinutes',
      'thresholdGB',
      'hibernationHistory',
      'totalHibernatedCount',
      'totalSavedRAM_MB',
      'sessionDate',
      'sessionHibernatedCount',
      'sessionSavedRAM_MB',
      'ignoreList'
    ], (data) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      
      const safeData = data || {};
      const updates = {};
      const today = getTodayDateString();

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
      if (safeData.totalSavedRAM_MB === undefined) {
        updates.totalSavedRAM_MB = 0;
      }
      if (safeData.ignoreList === undefined) {
        updates.ignoreList = [];
      }
      
      if (safeData.sessionDate !== today) {
        updates.sessionDate = today;
        updates.sessionHibernatedCount = 0;
        updates.sessionSavedRAM_MB = 0;
      }

      if (Object.keys(updates).length > 0) {
        chrome.storage.local.set(updates, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  });
}

// Log a hibernation event to storage using debouncing to batch multiple writes
function logHibernation(tab) {
  const savedMB = estimateTabRAM(tab.url);
  const entry = {
    id: Math.random().toString(36).substring(2, 9),
    title: tab.title || 'Untitled Tab',
    url: tab.url || '',
    favIconUrl: tab.favIconUrl || '',
    timestamp: Date.now(),
    windowId: tab.windowId,
    estimatedSavedMB: savedMB
  };

  pendingLogs.push(entry);

  if (logDebounceTimeout) {
    clearTimeout(logDebounceTimeout);
  }

  logDebounceTimeout = setTimeout(flushPendingLogs, 250);
}

// Write all accumulated logs to storage at once
function flushPendingLogs() {
  if (pendingLogs.length === 0) return;
  
  const logsToWrite = [...pendingLogs];
  pendingLogs = [];
  logDebounceTimeout = null;

  const today = getTodayDateString();

  chrome.storage.local.get([
    'hibernationHistory',
    'totalHibernatedCount',
    'totalSavedRAM_MB',
    'sessionDate',
    'sessionHibernatedCount',
    'sessionSavedRAM_MB'
  ], (data) => {
    if (chrome.runtime.lastError) {
      console.error('[RAMGuard Perf] Error getting storage in flushPendingLogs:', chrome.runtime.lastError);
      return;
    }
    const safeData = data || {};
    let history = safeData.hibernationHistory || [];
    
    let newSessionCount = safeData.sessionHibernatedCount || 0;
    let newSessionRAM = safeData.sessionSavedRAM_MB || 0;
    let newTotalCount = safeData.totalHibernatedCount || 0;
    let newTotalRAM = safeData.totalSavedRAM_MB || 0;

    // Reset session statistics if the date has changed
    if (safeData.sessionDate !== today) {
      newSessionCount = 0;
      newSessionRAM = 0;
    }

    // Process all buffered logs
    logsToWrite.forEach(entry => {
      history.unshift(entry);
      newSessionCount += 1;
      newSessionRAM += entry.estimatedSavedMB;
      newTotalCount += 1;
      newTotalRAM += entry.estimatedSavedMB;
    });

    // Filter and cap history
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    history = history.filter(item => item.timestamp > thirtyDaysAgo);
    
    const limit = 10;
    if (history.length > limit) {
      history = history.slice(0, limit);
    }

    chrome.storage.local.set({
      hibernationHistory: history,
      totalHibernatedCount: newTotalCount,
      totalSavedRAM_MB: newTotalRAM,
      sessionDate: today,
      sessionHibernatedCount: newSessionCount,
      sessionSavedRAM_MB: newSessionRAM,
      lastHibernationTime: Date.now()
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('[RAMGuard Perf] Error saving batched logs/stats:', chrome.runtime.lastError);
      } else {
        console.log(`[RAMGuard Perf] Batched and logged ${logsToWrite.length} hibernations to storage.`);
      }
    });
  });
}

// Single-pass check cycle for inactivity timeout, threshold limits, and tab limits.
// Processes discards in chunked batches and dynamically skips checks when user is active to prevent lag.
async function performTabHibernationChecks(allTabs, userState = 'idle') {
  const startTime = Date.now();
  try {
    const data = await chrome.storage.local.get(null);
    if (chrome.runtime.lastError) {
      console.error('[RAMGuard Perf] Error retrieving storage in checks:', chrome.runtime.lastError);
      return;
    }

    const settings = data || {};
    const globalInactiveMinutes = settings.hibernateInactiveMinutes || DEFAULT_INACTIVE_MINUTES;
    const ignoreList = settings.ignoreList || [];
    const thresholdGB = settings.thresholdGB || DEFAULT_THRESHOLD_GB;

    if (!allTabs || allTabs.length === 0) {
      allTabs = await chrome.tabs.query({});
    }
    
    // Categorize active vs discarded tabs
    const activeTabs = allTabs.filter(t => !t.discarded);
    const discardedTabs = allTabs.filter(t => t.discarded);

    const now = Date.now();
    const discardCandidates = [];
    const protectedTabs = [];

    for (const tab of activeTabs) {
      if (isTabEligible(tab, ignoreList)) {
        discardCandidates.push(tab);
      } else {
        protectedTabs.push(tab);
      }
    }

    // 1. INACTIVITY CHECK
    // If user is active, skip inactivity-based cleanups to avoid sleeping tabs they are actively referencing.
    const toDiscardInactivity = [];
    const remainingCandidates = [];

    if (userState === 'active') {
      remainingCandidates.push(...discardCandidates);
      console.log(`[RAMGuard Perf] User active. Deferring idle inactivity checks.`);
    } else {
      for (const tab of discardCandidates) {
        let thresholdMinutes = globalInactiveMinutes;
        const windowKey = `window_inactive_minutes_${tab.windowId}`;
        if (settings[windowKey] !== undefined) {
          thresholdMinutes = settings[windowKey];
        }

        const cutoff = now - thresholdMinutes * 60 * 1000;
        if (tab.lastAccessed < cutoff) {
          toDiscardInactivity.push(tab);
        } else {
          remainingCandidates.push(tab);
        }
      }
    }

    // Process inactivity discards in safe batches
    if (toDiscardInactivity.length > 0) {
      await processInBatches(toDiscardInactivity, (tab) => 
        chrome.tabs.discard(tab.id).catch(e => console.warn(`[RAMGuard] Discard error:`, e)),
        5
      );
      console.log(`[RAMGuard Perf] Inactivity check: Hibernated ${toDiscardInactivity.length} idle tabs.`);
    }

    // 2. RAM THRESHOLD CHECK
    const remainingActiveCount = protectedTabs.length + remainingCandidates.length;
    const totalDiscardedCount = discardedTabs.length + toDiscardInactivity.length;

    let estRAM_MB = (remainingActiveCount * ESTIMATED_ACTIVE_TAB_RAM_MB) + 
                     (totalDiscardedCount * ESTIMATED_DISCARDED_TAB_RAM_MB);
    let estRAM_GB = estRAM_MB / 1024;

    const toDiscardThreshold = [];
    if (estRAM_GB > thresholdGB) {
      console.log(`[RAMGuard Perf] Estimated RAM (${estRAM_GB.toFixed(2)} GB) exceeds threshold (${thresholdGB} GB).`);
      
      // Sort remaining candidates by last accessed time (oldest first)
      remainingCandidates.sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0));

      let currentEstRAM_GB = estRAM_GB;
      for (const tab of remainingCandidates) {
        if (currentEstRAM_GB <= thresholdGB) break;
        toDiscardThreshold.push(tab);
        currentEstRAM_GB -= (ESTIMATED_ACTIVE_TAB_RAM_MB - ESTIMATED_DISCARDED_TAB_RAM_MB) / 1024;
      }

      if (toDiscardThreshold.length > 0) {
        await processInBatches(toDiscardThreshold, (tab) => 
          chrome.tabs.discard(tab.id).catch(e => console.warn(`[RAMGuard] Discard error:`, e)),
          5
        );
        console.log(`[RAMGuard Perf] Threshold check: Hibernated ${toDiscardThreshold.length} oldest tabs.`);
      }
    }

    // 3. TAB LIMIT CHECK (Max 20 Active Tabs)
    // Exclude the candidate tabs discarded in Step 2 from final counts
    const finalActiveCount = remainingActiveCount - toDiscardThreshold.length;
    
    if (finalActiveCount > 20) {
      console.log(`[RAMGuard Perf] Active tab count (${finalActiveCount}) exceeds 20. Enforcing limit...`);
      
      const remainingActiveCandidates = remainingCandidates.filter(t => !toDiscardThreshold.includes(t));
      remainingActiveCandidates.sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0));

      const numToDiscardLimit = finalActiveCount - 20;
      const toDiscardLimit = remainingActiveCandidates.slice(0, numToDiscardLimit);

      if (toDiscardLimit.length > 0) {
        await processInBatches(toDiscardLimit, (tab) => 
          chrome.tabs.discard(tab.id).catch(e => console.warn(`[RAMGuard] Discard error:`, e)),
          5
        );
        console.log(`[RAMGuard Perf] Limit check: Hibernated ${toDiscardLimit.length} tabs to maintain active count <= 20.`);
      }
    }

  } catch (error) {
    console.error('[RAMGuard Perf] Error running performTabHibernationChecks:', error);
  } finally {
    console.log(`[RAMGuard Perf] Tab check cycle completed in ${Date.now() - startTime}ms.`);
  }
}

// Enforce tab limit immediately (used on tab created / startup)
async function enforceTabLimit() {
  try {
    const activeTabs = await chrome.tabs.query({ discarded: false });
    if (activeTabs.length > 20) {
      const data = await chrome.storage.local.get(['ignoreList']);
      if (chrome.runtime.lastError) return;
      const ignoreList = data.ignoreList || [];

      const candidates = activeTabs.filter(t => isTabEligible(t, ignoreList));
      candidates.sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0));
      
      const numToHibernate = activeTabs.length - 20;
      const toDiscard = candidates.slice(0, numToHibernate);

      if (toDiscard.length > 0) {
        await processInBatches(toDiscard, (tab) => 
          chrome.tabs.discard(tab.id).catch(e => console.warn(`[RAMGuard] Discard error:`, e)),
          5
        );
        console.log(`[RAMGuard Perf] Enforced tab limit: Hibernated ${toDiscard.length} tabs.`);
      }
    }
  } catch (error) {
    console.error('[RAMGuard Perf] Error in enforceTabLimit:', error);
  }
}

// Hibernate all eligible tabs right now (used by popup button and global hotkey)
async function hibernateAllEligible() {
  const data = await chrome.storage.local.get(['ignoreList']);
  const ignoreList = data.ignoreList || [];
  const tabs = await chrome.tabs.query({ active: false, discarded: false, pinned: false });
  
  const toDiscard = tabs.filter(tab => isTabEligible(tab, ignoreList));
  let count = 0;
  let savedRAM = 0;
  
  if (toDiscard.length > 0) {
    await processInBatches(toDiscard, async (tab) => {
      try {
        await chrome.tabs.discard(tab.id);
        count++;
        savedRAM += estimateTabRAM(tab.url);
      } catch (e) {
        console.warn(`[RAMGuard] Failed to discard tab ${tab.id}:`, e);
      }
    }, 5);
  }
  
  console.log(`[RAMGuard Perf] Manually hibernated ${count} tabs. Saved ${savedRAM} MB.`);
  return { count, savedRAM };
}

// Wake all tabs (or all tabs in a specific window) in parallel batches
async function wakeAllTabs(windowId = null) {
  const queryInfo = { discarded: true };
  if (windowId !== null) {
    queryInfo.windowId = windowId;
  }
  
  const tabs = await chrome.tabs.query(queryInfo);
  let count = 0;
  
  if (tabs.length > 0) {
    await processInBatches(tabs, async (tab) => {
      try {
        await chrome.tabs.reload(tab.id);
        count++;
      } catch (e) {
        console.warn(`[RAMGuard] Failed to reload tab ${tab.id}:`, e);
      }
    }, 5);
  }
  
  console.log(`[RAMGuard Perf] Woke up ${count} tabs.`);
  return count;
}

// Initialize storage settings on load
initStorage().then(() => {
  console.log('[RAMGuard Perf] Storage settings loaded and initialized.');
}).catch((err) => {
  console.error('[RAMGuard Perf] Storage settings initialization failed:', err);
});

// Initialize on install / update
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[RAMGuard Perf] Installed/Updated successfully.');
  try {
    await initStorage();
    // Setup periodic check alarm
    chrome.alarms.create('checkInactive', { periodInMinutes: 1 });
  } catch (err) {
    console.error('[RAMGuard Perf] Error during runtime.onInstalled init:', err);
  }
});

// Adaptive periodic alarm handler
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'checkInactive') return;
  
  // Query user idle status (60-second detection threshold)
  chrome.idle.queryState(60, async (state) => {
    try {
      const allTabs = await chrome.tabs.query({});
      const activeCount = allTabs.filter(t => !t.discarded).length;
      
      // Optimization: If the user is actively using the system and has a relatively low tab count,
      // skip checks to conserve CPU and prevent any input latency.
      if (state === 'active' && activeCount <= 15) {
        console.log(`[RAMGuard Perf] User active with low tab count (${activeCount}). Skipping periodic checks.`);
        return;
      }
      
      await performTabHibernationChecks(allTabs, state);
    } catch (error) {
      console.error('[RAMGuard Perf] Error during scheduled check:', error);
    }
  });
});

// Run cleanup checks immediately when the system goes idle or locks
chrome.idle.onStateChanged.addListener((state) => {
  if (state === 'idle' || state === 'locked') {
    console.log('[RAMGuard Perf] System became idle/locked. Triggering immediate tab hibernation checks.');
    chrome.tabs.query({}, (allTabs) => {
      if (chrome.runtime.lastError) return;
      performTabHibernationChecks(allTabs, state).catch(err => {
        console.error('[RAMGuard Perf] Error during idle state check:', err);
      });
    });
  }
});

// Command Listener (Global Hotkey)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'hibernate-now') {
    console.log('[RAMGuard Perf] Hibernate Now hotkey triggered');
    try {
      await hibernateAllEligible();
    } catch (error) {
      console.error('[RAMGuard Perf] Error during hotkey hibernation:', error);
    }
  }
});

// Clean up window profile settings when windows are closed to prevent storage bloat
chrome.windows.onRemoved.addListener((windowId) => {
  const profileKey = `window_inactive_minutes_${windowId}`;
  chrome.storage.local.remove(profileKey, () => {
    if (chrome.runtime.lastError) {
      console.error('[RAMGuard Perf] Error removing window profile setting:', chrome.runtime.lastError);
    }
  });
});

// Enforce tab limit immediately on tab creation
chrome.tabs.onCreated.addListener(() => {
  enforceTabLimit().catch(err => {
    console.error('[RAMGuard Perf] Error in onCreated tab limit enforcement:', err);
  });
});

// Track discards for history (triggered by our discards or Chrome's native discards)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.discarded === true) {
    console.log(`[RAMGuard Perf] Tab discarded: "${tab.title}" (${tab.url})`);
    logHibernation(tab);
  }
});

// Message Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.command === 'hibernate-now') {
    hibernateAllEligible()
      .then((result) => sendResponse({ success: true, count: result.count, savedRAM: result.savedRAM }))
      .catch((err) => {
        console.error('[RAMGuard Perf] Error handling manual hibernation message:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep message channel open for async response
  }

  if (message.command === 'wake-all') {
    wakeAllTabs(message.windowId)
      .then((count) => sendResponse({ success: true, count }))
      .catch((err) => {
        console.error('[RAMGuard Perf] Error handling wake all message:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
});
