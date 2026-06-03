// RAMGuard v1.6.3 Popup Controller
// Handles Google Material Design 3 theme transitions, statistics, ignore lists, autocomplete, and waking.

document.addEventListener('DOMContentLoaded', () => {
  console.log('[RAMGuard Perf] Popup initialized.');

  // Cache DOM elements
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const activeTabsCountEl = document.getElementById('activeTabsCount');
  const sleepingTabsCountEl = document.getElementById('sleepingTabsCount');
  const sessionSavedRAMEl = document.getElementById('sessionSavedRAM');
  const totalSavedRAMEl = document.getElementById('totalSavedRAM');
  const sessionTabsCountEl = document.getElementById('sessionTabsCount');
  const sessionRAMSavedTodayEl = document.getElementById('sessionRAMSavedToday');
  
  const hibernateNowBtn = document.getElementById('hibernateNowBtn');
  const inactiveSlider = document.getElementById('inactiveSlider');
  const inactiveValue = document.getElementById('inactiveValue');
  
  const sleepingTabsList = document.getElementById('sleepingTabsList');
  const historyTabsList = document.getElementById('historyTabsList');
  
  const wakeAllBtn = document.getElementById('wakeAllBtn');
  const wakeWindowBtn = document.getElementById('wakeWindowBtn');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toastText');
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabPanes = document.querySelectorAll('.tab-pane');

  // Ignore List Elements
  const newIgnoreInput = document.getElementById('newIgnoreInput');
  const addIgnoreBtn = document.getElementById('addIgnoreBtn');
  const ignoreListContainer = document.getElementById('ignoreListContainer');
  const ignoreCountBadge = document.getElementById('ignoreCountBadge');
  const autocompleteDropdown = document.getElementById('autocompleteDropdown');

  // Autocomplete Suggestions Configuration
  const SUGGESTED_DOMAINS = [
    'youtube.com',
    'netflix.com',
    'docs.google.com',
    'drive.google.com',
    'meet.google.com',
    'calendar.google.com',
    'chatgpt.com',
    'notion.so',
    'twitter.com',
    'linkedin.com',
    'reddit.com'
  ];

  let activeSuggestionIndex = -1;
  let currentSuggestions = [];

  // Fuzzy match helper: matches sequences of characters in order
  function isFuzzyMatch(query, target) {
    query = query.toLowerCase();
    target = target.toLowerCase();
    
    if (target.includes(query)) return true;
    
    let qIdx = 0;
    for (let tIdx = 0; tIdx < target.length; tIdx++) {
      if (target[tIdx] === query[qIdx]) {
        qIdx++;
      }
      if (qIdx === query.length) {
        return true;
      }
    }
    return false;
  }

  function closeDropdown() {
    autocompleteDropdown.style.display = 'none';
    autocompleteDropdown.innerHTML = '';
    activeSuggestionIndex = -1;
    currentSuggestions = [];
  }

  function showSuggestions(query) {
    if (query.length < 2) {
      closeDropdown();
      return;
    }

    chrome.storage.local.get(['ignoreList'], (data) => {
      const ignoreList = data.ignoreList || [];
      
      // Exclude suggestions that are already in the ignore list
      const filteredDefaults = SUGGESTED_DOMAINS.filter(d => !ignoreList.includes(d));
      
      // Run fuzzy matching check
      currentSuggestions = filteredDefaults.filter(d => isFuzzyMatch(query, d));

      if (currentSuggestions.length === 0) {
        closeDropdown();
        return;
      }

      autocompleteDropdown.innerHTML = '';
      const fragment = document.createDocumentFragment();

      currentSuggestions.forEach((domain, index) => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.textContent = domain;
        item.dataset.index = index;

        // Click adds suggestion
        item.addEventListener('click', () => {
          newIgnoreInput.value = domain;
          addIgnoreBtn.click();
          closeDropdown();
        });

        // Mouse hover updates index
        item.addEventListener('mousemove', () => {
          setActiveSuggestion(index);
        });

        fragment.appendChild(item);
      });

      autocompleteDropdown.appendChild(fragment);
      autocompleteDropdown.style.display = 'block';
      activeSuggestionIndex = -1;
    });
  }

  function setActiveSuggestion(index) {
    const items = autocompleteDropdown.querySelectorAll('.autocomplete-item');
    items.forEach(item => item.classList.remove('active'));
    
    activeSuggestionIndex = index;
    if (index >= 0 && index < items.length) {
      items[index].classList.add('active');
      items[index].scrollIntoView({ block: 'nearest' });
    }
  }

  // --- 1. SEGMENTED TAB NAVIGATION ---
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      navTabs.forEach(t => t.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.dataset.target;
      const targetPane = document.getElementById(targetId);
      if (targetPane) {
        targetPane.classList.add('active');
      }
    });
  });

  // --- 2. THEME MANAGEMENT ---
  function setTheme(isDark) {
    if (isDark) {
      document.body.classList.remove('light');
      document.body.classList.add('dark');
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
    chrome.storage.local.get([
      'hibernateInactiveMinutes',
      'hibernationHistory',
      'ignoreList',
      'totalSavedRAM_MB',
      'sessionSavedRAM_MB',
      'sessionHibernatedCount'
    ], (data) => {
      if (chrome.runtime.lastError) {
        console.error('[RAMGuard Perf] Error retrieving storage settings:', chrome.runtime.lastError);
        return;
      }
      const safeData = data || {};

      // Initialize slider configurations
      const minutes = safeData.hibernateInactiveMinutes || 1;
      inactiveSlider.value = minutes;
      inactiveValue.textContent = `${minutes} min`;

      // Update tab metrics and history lists
      updateTabsStatistics(
        safeData.totalSavedRAM_MB || 0,
        safeData.sessionSavedRAM_MB || 0,
        safeData.sessionHibernatedCount || 0
      );
      renderHistory(safeData.hibernationHistory || []);
      renderIgnoreList(safeData.ignoreList || []);
    });
  }

  // --- 4. TAB STATISTICS & LIST RENDERING ---
  function updateTabsStatistics(totalSavedRAM_MB, sessionSavedRAM_MB, sessionCount) {
    chrome.tabs.query({}, (tabs) => {
      if (chrome.runtime.lastError) {
        console.error('[RAMGuard Perf] Error querying active/inactive tabs:', chrome.runtime.lastError);
        return;
      }
      const activeCount = tabs.filter(t => !t.discarded).length;
      const sleepingTabs = tabs.filter(t => t.discarded);
      const sleepingCount = sleepingTabs.length;

      // Render counts
      activeTabsCountEl.textContent = activeCount;
      sleepingTabsCountEl.textContent = sleepingCount;

      // Format RAM saved display
      function formatRAM(mb) {
        if (mb >= 1024) {
          return `${(mb / 1024).toFixed(1)} GB`;
        }
        return `${mb} MB`;
      }

      // Show RAM Saved
      if (sessionSavedRAMEl) {
        sessionSavedRAMEl.textContent = formatRAM(sessionSavedRAM_MB);
      }
      if (totalSavedRAMEl) {
        totalSavedRAMEl.textContent = `Total: ${formatRAM(totalSavedRAM_MB)}`;
      }

      // Today's Session Summary Box
      if (sessionTabsCountEl) {
        sessionTabsCountEl.textContent = `${sessionCount} tab${sessionCount === 1 ? '' : 's'} hibernated`;
      }
      if (sessionRAMSavedTodayEl) {
        sessionRAMSavedTodayEl.textContent = `${formatRAM(sessionSavedRAM_MB)} RAM saved`;
      }

      // Render sleeping tab list items
      sleepingTabsList.innerHTML = '';

      if (sleepingCount === 0) {
        sleepingTabsList.innerHTML = `
          <div class="empty-state">
            <div class="empty-title">All tabs are awake</div>
          </div>
        `;
        return;
      }

      const fragment = document.createDocumentFragment();

      sleepingTabs.forEach(tab => {
        const item = document.createElement('div');
        item.className = 'list-item';

        const faviconSrc = tab.favIconUrl || '/icons/icon-16.png';

        item.innerHTML = `
          <div class="tab-info-wrap" title="Click to wake up and focus this tab">
            <img class="tab-favicon" src="${faviconSrc}">
            <div class="tab-text-details">
              <span class="tab-title-text">${escapeHTML(tab.title || 'Untitled Tab')}</span>
            </div>
          </div>
          <button class="wake-btn" title="Wake up tab">Wake</button>
        `;

        // Handle image loading error safely (using once: true to prevent event listener leakage)
        const img = item.querySelector('.tab-favicon');
        img.addEventListener('error', () => {
          img.src = '/icons/icon-16.png';
        }, { once: true });

        // Click to focus and wake tab
        item.querySelector('.tab-info-wrap').addEventListener('click', () => {
          chrome.tabs.update(tab.id, { active: true }, () => {
            if (chrome.runtime.lastError) console.warn('[RAMGuard Perf] Error focusing tab:', chrome.runtime.lastError);
          });
          chrome.windows.update(tab.windowId, { focused: true }, () => {
            if (chrome.runtime.lastError) console.warn('[RAMGuard Perf] Error focusing window:', chrome.runtime.lastError);
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

        fragment.appendChild(item);
      });

      sleepingTabsList.appendChild(fragment);
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

    const fragment = document.createDocumentFragment();

    history.forEach(item => {
      const div = document.createElement('div');
      div.className = 'list-item';

      const timeStr = formatTime(item.timestamp);
      const faviconSrc = item.favIconUrl || '/icons/icon-16.png';
      const estimatedSaved = item.estimatedSavedMB ? ` (${item.estimatedSavedMB} MB saved)` : '';

      div.innerHTML = `
        <div class="tab-info-wrap" title="${escapeHTML(item.url || 'No URL')}${estimatedSaved}">
          <img class="tab-favicon" src="${faviconSrc}">
          <div class="tab-text-details">
            <span class="tab-title-text">${escapeHTML(item.title || 'Untitled Tab')}</span>
            <span class="tab-meta-text">${timeStr}${estimatedSaved}</span>
          </div>
        </div>
      `;

      // Handle fallback icon on error safely
      const img = div.querySelector('.tab-favicon');
      img.addEventListener('error', () => {
        img.src = '/icons/icon-16.png';
      }, { once: true });

      fragment.appendChild(div);
    });

    historyTabsList.appendChild(fragment);
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // --- 6. IGNORE LIST RENDER & ACTIONS ---
  function renderIgnoreList(ignoreList) {
    ignoreListContainer.innerHTML = '';
    const list = ignoreList || [];
    ignoreCountBadge.textContent = `${list.length} site${list.length === 1 ? '' : 's'}`;

    if (list.length === 0) {
      ignoreListContainer.innerHTML = `
        <div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 10px 0;">
          No ignored sites yet
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();

    list.forEach(domain => {
      const item = document.createElement('div');
      item.className = 'list-item';
      item.style.padding = '8px 0';
      
      const domainSpan = document.createElement('span');
      domainSpan.style.fontSize = '13px';
      domainSpan.style.color = 'var(--text-primary)';
      domainSpan.style.wordBreak = 'break-all';
      domainSpan.style.fontWeight = '400';
      domainSpan.textContent = domain;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'wake-btn remove-ignore-btn';
      removeBtn.style.padding = '4px 12px';
      removeBtn.style.fontSize = '11px';
      removeBtn.style.borderRadius = '100px';
      removeBtn.textContent = 'Remove';
      
      // Remove domain handler
      removeBtn.addEventListener('click', () => {
        chrome.storage.local.get(['ignoreList'], (data) => {
          const currentList = data.ignoreList || [];
          const updatedList = currentList.filter(d => d !== domain);
          chrome.storage.local.set({ ignoreList: updatedList }, () => {
            if (chrome.runtime.lastError) {
              showToast('Failed to remove site', 'error');
            } else {
              showToast('Site removed', 'success');
              refreshData();
            }
          });
        });
      });

      item.appendChild(domainSpan);
      item.appendChild(removeBtn);
      fragment.appendChild(item);
    });

    ignoreListContainer.appendChild(fragment);
  }

  // Add Domain to Ignore List
  addIgnoreBtn.addEventListener('click', () => {
    const rawVal = newIgnoreInput.value.trim().toLowerCase();
    if (!rawVal) return;
    
    let domain = rawVal;
    try {
      if (domain.includes('://')) {
        domain = new URL(domain).hostname;
      } else if (domain.includes('/')) {
        domain = domain.split('/')[0];
      }
    } catch (e) {
      // Keep domain if URL parsing fails
    }
    
    // Strip leading www. if present
    if (domain.startsWith('www.')) {
      domain = domain.substring(4);
    }
    
    if (!domain) {
      showToast('Invalid domain name', 'error');
      return;
    }

    chrome.storage.local.get(['ignoreList'], (data) => {
      const currentList = data.ignoreList || [];
      if (currentList.includes(domain)) {
        showToast('Site already ignored', 'info');
        return;
      }
      
      const updatedList = [...currentList, domain];
      chrome.storage.local.set({ ignoreList: updatedList }, () => {
        if (chrome.runtime.lastError) {
          showToast('Failed to add site', 'error');
        } else {
          newIgnoreInput.value = '';
          closeDropdown(); // Close suggestion box
          showToast('Site added to ignore list', 'success');
          refreshData();
        }
      });
    });
  });

  // Autocomplete event listeners on the search input
  newIgnoreInput.addEventListener('input', () => {
    const query = newIgnoreInput.value.trim().toLowerCase();
    showSuggestions(query);
  });

  newIgnoreInput.addEventListener('keydown', (e) => {
    if (autocompleteDropdown.style.display === 'block') {
      const items = autocompleteDropdown.querySelectorAll('.autocomplete-item');
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        let nextIndex = activeSuggestionIndex + 1;
        if (nextIndex >= items.length) nextIndex = 0;
        setActiveSuggestion(nextIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        let prevIndex = activeSuggestionIndex - 1;
        if (prevIndex < 0) prevIndex = items.length - 1;
        setActiveSuggestion(prevIndex);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeSuggestionIndex >= 0 && activeSuggestionIndex < currentSuggestions.length) {
          newIgnoreInput.value = currentSuggestions[activeSuggestionIndex];
        }
        addIgnoreBtn.click();
        closeDropdown();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeDropdown();
      }
    } else {
      if (e.key === 'Enter') {
        e.preventDefault();
        addIgnoreBtn.click();
      }
    }
  });

  // Close suggestions with slight delay when input loses focus (lets click events complete)
  newIgnoreInput.addEventListener('blur', () => {
    setTimeout(closeDropdown, 200);
  });

  // --- 7. ACTION HANDLERS ---
  
  // Real-time slider text representation updates on input (CPU friendly)
  inactiveSlider.addEventListener('input', () => {
    inactiveValue.textContent = `${inactiveSlider.value} min`;
  });

  // Write changes to storage ONLY when user releases the slider (avoids multiple concurrent writes)
  inactiveSlider.addEventListener('change', () => {
    const val = parseInt(inactiveSlider.value);
    chrome.storage.local.set({ hibernateInactiveMinutes: val }, () => {
      if (chrome.runtime.lastError) {
        console.error('[RAMGuard Perf] Error saving timeout:', chrome.runtime.lastError);
      } else {
        console.log(`[RAMGuard Perf] Inactivity timeout updated to ${val} min.`);
      }
    });
  });

  // Manual Hibernation Action
  hibernateNowBtn.addEventListener('click', () => {
    hibernateNowBtn.setAttribute('disabled', 'true');
    const originalText = hibernateNowBtn.textContent;
    hibernateNowBtn.textContent = 'Hibernating...';

    chrome.runtime.sendMessage({ command: 'hibernate-now' }, (response) => {
      hibernateNowBtn.removeAttribute('disabled');
      hibernateNowBtn.textContent = originalText;

      if (chrome.runtime.lastError) {
        console.error('[RAMGuard Perf] Error communicating with background worker:', chrome.runtime.lastError);
        showToast('Service worker connection failed', 'error');
        return;
      }

      if (response && response.success) {
        const count = response.count || 0;
        const savedRAM = response.savedRAM || 0;
        if (count > 0) {
          showToast(`Hibernated ${count} tab${count === 1 ? '' : 's'} • ${savedRAM} MB saved`, 'success');
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

  // Wake All Global Action
  wakeAllBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ command: 'wake-all' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[RAMGuard Perf] Error sending wake-all command:', chrome.runtime.lastError);
        showToast('Action failed', 'error');
        return;
      }
      if (response && response.success) {
        const count = response.count || 0;
        showToast(`Woke up ${count} tab${count === 1 ? '' : 's'} globally`, 'success');
        refreshData();
      }
    });
  });

  // Wake All in Current Window Action
  wakeWindowBtn.addEventListener('click', () => {
    chrome.windows.getCurrent({ populate: false }, (win) => {
      if (chrome.runtime.lastError) {
        console.error('[RAMGuard Perf] Error getting current window:', chrome.runtime.lastError);
        showToast('Action failed', 'error');
        return;
      }
      chrome.runtime.sendMessage({ command: 'wake-all', windowId: win.id }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[RAMGuard Perf] Error sending wake-all command:', chrome.runtime.lastError);
          showToast('Action failed', 'error');
          return;
        }
        if (response && response.success) {
          const count = response.count || 0;
          showToast(`Woke up ${count} tab${count === 1 ? '' : 's'} in this window`, 'success');
          refreshData();
        }
      });
    });
  });

  // Clear History Log Action
  clearHistoryBtn.addEventListener('click', () => {
    chrome.storage.local.set({ hibernationHistory: [] }, () => {
      if (chrome.runtime.lastError) {
        console.error('[RAMGuard Perf] Error clearing history log:', chrome.runtime.lastError);
        showToast('Failed to clear log', 'error');
      } else {
        showToast('History log cleared', 'success');
        refreshData();
      }
    });
  });

  // --- 8. UI TOAST HELPERS ---
  let toastTimeout;
  function showToast(message, type = 'info') {
    toastText.textContent = message;
    
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
