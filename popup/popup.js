// RAMGuard v1.3.0 Popup Controller
// Handles clean, emoji-free UI theme transitions, live statistics, history log, and background tab operations.

document.addEventListener('DOMContentLoaded', () => {
  console.log('[RAMGuard] Popup initialized.');

  // Cache DOM elements
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const activeTabsCountEl = document.getElementById('activeTabsCount');
  const sleepingTabsCountEl = document.getElementById('sleepingTabsCount');
  const totalSavedRAMEl = document.getElementById('totalSavedRAM');
  const hibernateNowBtn = document.getElementById('hibernateNowBtn');
  const inactiveSlider = document.getElementById('inactiveSlider');
  const inactiveValue = document.getElementById('inactiveValue');
  const sleepingTabsList = document.getElementById('sleepingTabsList');
  const historyTabsList = document.getElementById('historyTabsList');
  const wakeAllBtn = document.getElementById('wakeAllBtn');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toastText');
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabPanes = document.querySelectorAll('.tab-pane');

  // --- 1. SEGMENTED TAB NAVIGATION ---
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      navTabs.forEach(t => t.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.dataset.target;
      document.getElementById(targetId).classList.add('active');
    });
  });

  // --- 2. THEME MANAGEMENT ---
  // Follow system preferences by default with toggle overrides
  function setTheme(isDark) {
    if (isDark) {
      document.body.classList.remove('light');
      document.body.classList.add('dark');
      // Show sun icon in dark mode so user can toggle to light mode
      themeToggleBtn.innerHTML = `
        <svg class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/>
          <line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      `;
      themeToggleBtn.title = "Switch to Light Theme";
    } else {
      document.body.classList.remove('dark');
      document.body.classList.add('light');
      // Show moon icon in light mode so user can toggle to dark mode
      themeToggleBtn.innerHTML = `
        <svg class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      `;
      themeToggleBtn.title = "Switch to Dark Theme";
    }
  }

  // Detect system theme preference
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  setTheme(systemPrefersDark.matches);
  
  // Listen for system theme updates
  systemPrefersDark.addEventListener('change', (e) => {
    setTheme(e.matches);
  });

  // Manual theme toggle button action
  themeToggleBtn.addEventListener('click', () => {
    const isDark = document.body.classList.contains('dark');
    setTheme(!isDark);
  });

  // --- 3. REFRESH DATA & STATISTICS ---
  function refreshData() {
    chrome.storage.local.get(['hibernateInactiveMinutes', 'hibernationHistory'], (data) => {
      if (chrome.runtime.lastError) {
        console.error('[RAMGuard] Error retrieving storage settings:', chrome.runtime.lastError);
        return;
      }
      const safeData = data || {};

      // Initialize slider configurations
      const minutes = safeData.hibernateInactiveMinutes || 1;
      inactiveSlider.value = minutes;
      inactiveValue.textContent = `${minutes} min`;

      // Update tab metrics and history lists
      updateTabsStatistics();
      renderHistory(safeData.hibernationHistory || []);
    });
  }

  // --- 4. TAB STATISTICS & LIST RENDERING ---
  function updateTabsStatistics() {
    chrome.tabs.query({}, (tabs) => {
      if (chrome.runtime.lastError) {
        console.error('[RAMGuard] Error querying active/inactive tabs:', chrome.runtime.lastError);
        return;
      }
      const activeCount = tabs.filter(t => !t.discarded).length;
      const sleepingTabs = tabs.filter(t => t.discarded);
      const sleepingCount = sleepingTabs.length;

      // Render cards
      activeTabsCountEl.textContent = activeCount;
      sleepingTabsCountEl.textContent = sleepingCount;

      // RAM Saved Calculation: ~80 MB per sleeping tab
      const savedRAM_MB = sleepingCount * 80;
      if (savedRAM_MB >= 1024) {
        totalSavedRAMEl.textContent = `${(savedRAM_MB / 1024).toFixed(1)} GB`;
      } else {
        totalSavedRAMEl.textContent = `${savedRAM_MB} MB`;
      }

      // Render scroll list items
      sleepingTabsList.innerHTML = '';

      if (sleepingCount === 0) {
        sleepingTabsList.innerHTML = `
          <div class="empty-state">
            <div class="empty-title">All tabs are awake</div>
          </div>
        `;
        return;
      }

      sleepingTabs.forEach(tab => {
        const item = document.createElement('div');
        item.className = 'list-item';

        const faviconSrc = tab.favIconUrl || '/icons/icon-16-removebg-preview.png';

        item.innerHTML = `
          <div class="tab-info-wrap" title="Click to wake up and focus this tab">
            <img class="tab-favicon" src="${faviconSrc}">
            <div class="tab-text-details">
              <span class="tab-title-text">${escapeHTML(tab.title || 'Untitled Tab')}</span>
            </div>
          </div>
          <button class="wake-btn" title="Wake up tab">Wake</button>
        `;

        // Handle image loading error safely
        const img = item.querySelector('.tab-favicon');
        img.addEventListener('error', () => {
          img.src = '/icons/icon-16-removebg-preview.png';
        });

        // Click to focus and wake tab
        item.querySelector('.tab-info-wrap').addEventListener('click', () => {
          chrome.tabs.update(tab.id, { active: true }, () => {
            if (chrome.runtime.lastError) console.warn('[RAMGuard] Error focusing tab:', chrome.runtime.lastError);
          });
          chrome.windows.update(tab.windowId, { focused: true }, () => {
            if (chrome.runtime.lastError) console.warn('[RAMGuard] Error focusing window:', chrome.runtime.lastError);
          });
          window.close();
        });

        // Click to wake in background
        item.querySelector('.wake-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          chrome.tabs.reload(tab.id, {}, () => {
            if (chrome.runtime.lastError) {
              showToast('Failed to reload tab', 'error');
            } else {
              showToast('Tab woke up successfully', 'success');
              refreshData();
            }
          });
        });

        sleepingTabsList.appendChild(item);
      });
    });
  }

  // --- 5. RENDER HISTORY LIST ---
  function renderHistory(history) {
    historyTabsList.innerHTML = '';
    
    if (!history || history.length === 0) {
      historyTabsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-title">No history logs yet</div>
        </div>
      `;
      return;
    }

    history.forEach(item => {
      const div = document.createElement('div');
      div.className = 'list-item';

      const timeStr = formatTime(item.timestamp);
      const faviconSrc = item.favIconUrl || '/icons/icon-16-removebg-preview.png';

      div.innerHTML = `
        <div class="tab-info-wrap" title="${escapeHTML(item.url || 'No URL')}">
          <img class="tab-favicon" src="${faviconSrc}">
          <div class="tab-text-details">
            <span class="tab-title-text">${escapeHTML(item.title || 'Untitled Tab')}</span>
            <span class="tab-meta-text">${timeStr}</span>
          </div>
        </div>
      `;

      // Handle fallback icon on error
      const img = div.querySelector('.tab-favicon');
      img.addEventListener('error', () => {
        img.src = '/icons/icon-16-removebg-preview.png';
      });

      historyTabsList.appendChild(div);
    });
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // --- 6. ACTION HANDLERS ---
  // Inactivity Slider input change handler
  inactiveSlider.addEventListener('input', () => {
    const val = inactiveSlider.value;
    inactiveValue.textContent = `${val} min`;
    chrome.storage.local.set({ hibernateInactiveMinutes: parseInt(val) }, () => {
      if (chrome.runtime.lastError) console.error('[RAMGuard] Error saving idle timeout settings:', chrome.runtime.lastError);
    });
  });

  // Manual Hibernation
  hibernateNowBtn.addEventListener('click', () => {
    hibernateNowBtn.setAttribute('disabled', 'true');
    const originalText = hibernateNowBtn.textContent;
    hibernateNowBtn.textContent = 'Hibernating...';

    chrome.tabs.query({ active: false, discarded: false, pinned: false }, (inactiveTabs) => {
      if (chrome.runtime.lastError) {
        console.error('[RAMGuard] Error querying inactive background tabs:', chrome.runtime.lastError);
        hibernateNowBtn.removeAttribute('disabled');
        hibernateNowBtn.textContent = originalText;
        showToast('Failed to query background tabs', 'error');
        return;
      }
      
      const expectedCount = (inactiveTabs || []).length;
      const expectedSaved_MB = expectedCount * 80;

      chrome.runtime.sendMessage({ command: 'hibernate-now' }, (response) => {
        hibernateNowBtn.removeAttribute('disabled');
        hibernateNowBtn.textContent = originalText;

        if (chrome.runtime.lastError) {
          console.error('[RAMGuard] Error communicating with background service worker:', chrome.runtime.lastError);
          showToast('Service worker connection failed', 'error');
          return;
        }

        if (response && response.success) {
          if (expectedCount > 0) {
            showToast(`Hibernated ${expectedCount} tabs • ${expectedSaved_MB} MB saved`, 'success');
          } else {
            showToast('No background tabs needed hibernation', 'info');
          }
          refreshData();
        } else {
          showToast('Hibernation action finished with errors', 'error');
          refreshData();
        }
      });
    });
  });

  // Wake All Action
  wakeAllBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ command: 'wake-all' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[RAMGuard] Error sending wake-all command:', chrome.runtime.lastError);
        showToast('Action failed', 'error');
        return;
      }
      if (response && response.success) {
        const count = response.count || 0;
        showToast(`Woke up ${count} tabs`, 'success');
        refreshData();
      }
    });
  });

  // Clear History Log Action
  clearHistoryBtn.addEventListener('click', () => {
    chrome.storage.local.set({ hibernationHistory: [] }, () => {
      if (chrome.runtime.lastError) {
        console.error('[RAMGuard] Error clearing history log:', chrome.runtime.lastError);
        showToast('Failed to clear log', 'error');
      } else {
        showToast('History log cleared', 'success');
        refreshData();
      }
    });
  });

  // --- 7. UI TOAST & ESCAPING HELPERS ---
  let toastTimeout;
  function showToast(message, type = 'info') {
    toastText.textContent = message;
    
    // Set type styling classes
    toast.className = 'toast show';
    if (type === 'success') {
      toast.classList.add('toast-success');
    } else if (type === 'error') {
      toast.classList.add('toast-error');
    }

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }

  // Load state on startup
  refreshData();
});
