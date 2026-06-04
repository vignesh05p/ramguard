document.addEventListener('DOMContentLoaded', () => {
  // DOM Cache
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabPanes = document.querySelectorAll('.tab-pane');

  // Dashboard & Toggles
  const autoHibernateToggle = document.getElementById('autoHibernateToggle');
  const pauseToggle = document.getElementById('pauseToggle');
  const pauseTitle = document.getElementById('pauseTitle');
  const pauseSubTitle = document.getElementById('pauseSubTitle');
  const timerCard = document.getElementById('timerCard');
  
  // Stats
  const activeTabsCountEl = document.getElementById('activeTabsCount');
  const sleepingTabsCountEl = document.getElementById('sleepingTabsCount');
  const sessionSavedRAMEl = document.getElementById('sessionSavedRAM');
  const totalSavedRAMEl = document.getElementById('totalSavedRAM');
  const sessionTabsCountEl = document.getElementById('sessionTabsCount');
  const sessionRAMSavedTodayEl = document.getElementById('sessionRAMSavedToday');

  // Buttons
  const hibernateNowBtn = document.getElementById('hibernateNowBtn');
  const hibernateOtherBtn = document.getElementById('hibernateOtherBtn');
  const wakeAllBtn = document.getElementById('wakeAllBtn');
  const wakeWindowBtn = document.getElementById('wakeWindowBtn');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  // Lists & Settings
  const timerSelect = document.getElementById('hibernateAfterMinutesSelect');
  const protectedListContainer = document.getElementById('protectedListContainer');
  const sleepingTabsList = document.getElementById('sleepingTabsList');
  const historyTabsList = document.getElementById('historyTabsList');
  
  // Ignore List
  const newIgnoreInput = document.getElementById('newIgnoreInput');
  const addIgnoreBtn = document.getElementById('addIgnoreBtn');
  const ignoreListContainer = document.getElementById('ignoreListContainer');
  const ignoreCountBadge = document.getElementById('ignoreCountBadge');
  const autocompleteDropdown = document.getElementById('autocompleteDropdown');

  // Toast
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toastText');

  // Autocomplete Suggestions configuration
  const SUGGESTED_DOMAINS = [
    'youtube.com', 'netflix.com', 'docs.google.com', 'drive.google.com',
    'meet.google.com', 'calendar.google.com', 'chatgpt.com', 'notion.so',
    'twitter.com', 'linkedin.com', 'reddit.com'
  ];

  let activeSuggestionIndex = -1;
  let currentSuggestions = [];

  // --- 1. DEBOUNCED LIVE REFRESH SYSTEM ---
  let refreshTimeout = null;
  function triggerRefresh() {
    if (refreshTimeout) clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(refreshData, 100);
  }

  // --- 2. SEGMENTED TAB NAVIGATION ---
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
      refreshData();
    });
  });

  // --- 3. THEME MANAGEMENT ---
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
  systemPrefersDark.addEventListener('change', (e) => setTheme(e.matches));
  
  themeToggleBtn.addEventListener('click', () => {
    const isDark = document.body.classList.contains('dark');
    setTheme(!isDark);
  });

  // --- 4. REFRESH DATA & STAGE RECONCILIATION ---
  function refreshData() {
    chrome.storage.local.get([
      'hibernateAfterMinutes',
      'hibernationHistory',
      'ignoreList',
      'totalSavedRAM_MB',
      'sessionSavedRAM_MB',
      'sessionHibernatedCount',
      'autoHibernateEnabled'
    ], (data) => {
      if (chrome.runtime.lastError) {
        console.error('[RAMGuard] Error retrieving storage:', chrome.runtime.lastError);
        return;
      }
      const safeData = data || {};

      // Initialize Toggles and Input values
      const autoEnabled = safeData.autoHibernateEnabled !== false;
      autoHibernateToggle.checked = autoEnabled;
      if (timerCard) {
        timerCard.style.opacity = autoEnabled ? '1' : '0.5';
        timerCard.style.pointerEvents = autoEnabled ? 'auto' : 'none';
      }

      const minutes = safeData.hibernateAfterMinutes !== undefined ? safeData.hibernateAfterMinutes : 1;
      timerSelect.value = minutes;

      // Update calculations, history lists, ignore lists
      updateTabsStatistics(
        safeData.totalSavedRAM_MB || 0,
        safeData.sessionSavedRAM_MB || 0,
        safeData.sessionHibernatedCount || 0,
        safeData.hibernationHistory || []
      );
      renderHistory(safeData.hibernationHistory || []);
      renderIgnoreList(safeData.ignoreList || []);
      updatePauseButton();
      renderProtectedTabsList();
    });
  }

  // Render active shielded background tabs and their reasons
  function renderProtectedTabsList() {
    chrome.runtime.sendMessage({ command: 'get-active-protections' }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        protectedListContainer.innerHTML = `
          <div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 10px 0;">
            No protected background tabs
          </div>
        `;
        return;
      }
      
      protectedListContainer.innerHTML = '';
      if (!response.protections || response.protections.length === 0) {
        protectedListContainer.innerHTML = `
          <div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 10px 0;">
            No protected background tabs
          </div>
        `;
        return;
      }
      
      const fragment = document.createDocumentFragment();
      response.protections.forEach(item => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.style.padding = '6px 8px';
        
        const faviconSrc = item.favIconUrl || '/icons/icon-16.png';
        const displayDomain = getDisplayDomain(item.url);
        
        div.innerHTML = `
          <div class="tab-info-wrap" style="flex: 1; min-width: 0;" title="${escapeHTML(item.url || 'No URL')}">
            <img class="tab-favicon" src="${faviconSrc}">
            <div class="tab-text-details">
              <span class="tab-title-text" style="font-size: 11px;">${escapeHTML(item.title || 'Untitled Tab')}</span>
              <span class="tab-meta-text" style="font-size: 9px;">${escapeHTML(displayDomain)}</span>
            </div>
          </div>
          <span class="wake-btn" style="background-color: var(--color-primary-glow); color: var(--color-primary); font-size: 9px; padding: 2px 6px; border-radius: 4px; font-weight: 600; pointer-events: none; border: none;">
            ${escapeHTML(item.reason)}
          </span>
        `;
        
        const img = div.querySelector('.tab-favicon');
        img.addEventListener('error', () => {
          img.src = '/icons/icon-16.png';
        }, { once: true });
        
        fragment.appendChild(div);
      });
      protectedListContainer.appendChild(fragment);
    });
  }

  // Fast domain extraction
  function getDisplayDomain(url) {
    if (!url) return '';
    try {
      let hostname = new URL(url).hostname;
      if (hostname.startsWith('www.')) {
        hostname = hostname.substring(4);
      }
      return hostname;
    } catch (e) {
      return '';
    }
  }

  // Estimate Tab memory size
  function estimateTabRAM(url) {
    if (!url) return 100;
    const domain = getDisplayDomain(url);
    if (domain.includes('youtube.com') || domain.includes('netflix.com') || domain.includes('twitch.tv')) {
      return 350;
    }
    if (domain.includes('google.com/document') || domain.includes('sheets') || domain.includes('docs.google')) {
      return 250;
    }
    if (domain.includes('facebook.com') || domain.includes('twitter.com') || domain.includes('reddit.com')) {
      return 200;
    }
    if (domain.includes('github.com') || domain.includes('chatgpt.com')) {
      return 150;
    }
    return 90; // default safe baseline
  }

  // Update metrics and render currently sleeping tabs list
  function updateTabsStatistics(totalSavedRAM_MB, sessionSavedRAM_MB, sessionCount, history) {
    chrome.tabs.query({}, (tabs) => {
      if (chrome.runtime.lastError) return;
      
      const activeCount = tabs.filter(t => !t.discarded).length;
      const sleepingTabs = tabs.filter(t => t.discarded);
      const sleepingCount = sleepingTabs.length;

      // Compute estimated RAM savings live from the actual state
      let currentSleepingSavedRAM = 0;
      sleepingTabs.forEach(t => {
        currentSleepingSavedRAM += estimateTabRAM(t.url);
      });

      const displaySessionSaved = Math.max(sessionSavedRAM_MB, currentSleepingSavedRAM);
      const displayTotalSaved = Math.max(totalSavedRAM_MB, currentSleepingSavedRAM);
      const displaySessionCount = Math.max(sessionCount, sleepingCount);

      // Render counts
      activeTabsCountEl.textContent = activeCount;
      sleepingTabsCountEl.textContent = sleepingCount;

      function formatRAM(mb) {
        if (mb >= 1024) {
          return `${(mb / 1024).toFixed(1)} GB`;
        }
        return `${mb} MB`;
      }

      if (sessionSavedRAMEl) {
        sessionSavedRAMEl.textContent = formatRAM(displaySessionSaved);
      }
      if (totalSavedRAMEl) {
        totalSavedRAMEl.textContent = `Total: ${formatRAM(displayTotalSaved)}`;
      }
      if (sessionTabsCountEl) {
        sessionTabsCountEl.textContent = `${displaySessionCount} tab${displaySessionCount === 1 ? '' : 's'} hibernated`;
      }
      if (sessionRAMSavedTodayEl) {
        sessionRAMSavedTodayEl.textContent = `${formatRAM(displaySessionSaved)} RAM saved`;
      }

      // Render Sleeping tabs list
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
        const domain = getDisplayDomain(tab.url);
        
        // Find sleeping start time from history
        const match = history.find(h => h.url === tab.url || (tab.url && h.url.includes(tab.url)) || h.title === tab.title);
        let timeSleptStr = 'recently';
        if (match && match.timestamp) {
          const elapsedMs = Date.now() - match.timestamp;
          const mins = Math.floor(elapsedMs / 60000);
          if (mins < 1) {
            timeSleptStr = 'just now';
          } else if (mins < 60) {
            timeSleptStr = `${mins}m ago`;
          } else {
            const hrs = Math.floor(mins / 60);
            timeSleptStr = `${hrs}h ago`;
          }
        }

        const savedRAM = estimateTabRAM(tab.url);

        item.innerHTML = `
          <div class="tab-info-wrap" title="Click to wake up and focus this tab">
            <img class="tab-favicon" src="${faviconSrc}">
            <div class="tab-text-details">
              <span class="tab-title-text">${escapeHTML(tab.title || 'Untitled Tab')}</span>
              <span class="tab-meta-text">${escapeHTML(domain)} • Slept ${timeSleptStr} • ${savedRAM} MB saved</span>
            </div>
          </div>
          <button class="wake-btn" title="Wake up tab">Wake</button>
        `;

        const img = item.querySelector('.tab-favicon');
        img.addEventListener('error', () => {
          img.src = '/icons/icon-16.png';
        }, { once: true });

        // Click to focus and wake
        item.querySelector('.tab-info-wrap').addEventListener('click', () => {
          chrome.tabs.update(tab.id, { active: true }, () => {
            if (chrome.runtime.lastError) console.warn('[RAMGuard] Error focusing tab:', chrome.runtime.lastError);
          });
          chrome.windows.update(tab.windowId, { focused: true }, () => {
            if (chrome.runtime.lastError) console.warn('[RAMGuard] Error focusing window:', chrome.runtime.lastError);
          });
          window.close();
        });

        // Wake in background
        item.querySelector('.wake-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          chrome.tabs.reload(tab.id, {}, () => {
            if (chrome.runtime.lastError) {
              showToast('Failed to reload tab', 'error');
            } else {
              showToast('Tab woke up successfully', 'success');
              triggerRefresh();
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
      const displayDomain = getDisplayDomain(item.url);

      div.innerHTML = `
        <div class="tab-info-wrap" title="${escapeHTML(item.url || '')}${estimatedSaved}">
          <img class="tab-favicon" src="${faviconSrc}">
          <div class="tab-text-details">
            <span class="tab-title-text">${escapeHTML(item.title || 'Untitled Tab')}</span>
            <span class="tab-meta-text">${timeStr} • ${escapeHTML(displayDomain)}${estimatedSaved}</span>
          </div>
        </div>
      `;

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
        <div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 10px 0;">
          No ignored sites yet
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();
    list.forEach(domain => {
      const item = document.createElement('div');
      item.className = 'list-item';
      item.style.padding = '4px 6px';
      
      const domainSpan = document.createElement('span');
      domainSpan.style.fontSize = '12px';
      domainSpan.style.color = 'var(--text-primary)';
      domainSpan.style.wordBreak = 'break-all';
      domainSpan.textContent = domain;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'wake-btn remove-ignore-btn';
      removeBtn.style.padding = '2px 8px';
      removeBtn.style.fontSize = '9px';
      removeBtn.textContent = 'Remove';
      
      removeBtn.addEventListener('click', () => {
        chrome.storage.local.get(['ignoreList'], (data) => {
          const currentList = data.ignoreList || [];
          const updatedList = currentList.filter(d => d !== domain);
          chrome.storage.local.set({ ignoreList: updatedList }, () => {
            if (chrome.runtime.lastError) {
              showToast('Failed to remove site', 'error');
            } else {
              showToast('Site removed', 'success');
              triggerRefresh();
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

  // Add Ignore Action
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
    } catch (e) {}
    
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
          closeDropdown();
          showToast('Site added to ignore list', 'success');
          triggerRefresh();
        }
      });
    });
  });

  // Autocomplete functionality
  function isFuzzyMatch(query, target) {
    query = query.toLowerCase();
    target = target.toLowerCase();
    if (target.includes(query)) return true;
    let qIdx = 0;
    for (let tIdx = 0; tIdx < target.length; tIdx++) {
      if (target[tIdx] === query[qIdx]) qIdx++;
      if (qIdx === query.length) return true;
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
    chrome.storage.local.get(['ignoreList'], (data) => {
      const ignoreList = data.ignoreList || [];
      const filteredDefaults = SUGGESTED_DOMAINS.filter(d => !ignoreList.includes(d));
      
      if (!query || query.length < 1) {
        currentSuggestions = filteredDefaults;
      } else {
        currentSuggestions = filteredDefaults.filter(d => isFuzzyMatch(query, d));
      }

      if (currentSuggestions.length === 0) {
        closeDropdown();
        return;
      }

      autocompleteDropdown.innerHTML = '';
      const fragment = document.createDocumentFragment();

      if (!query || query.length < 1) {
        const header = document.createElement('div');
        header.className = 'autocomplete-header';
        header.textContent = 'POPULAR SUGGESTIONS';
        fragment.appendChild(header);
      }

      currentSuggestions.forEach((domain, index) => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.textContent = domain;
        item.dataset.index = index;

        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          newIgnoreInput.value = domain;
          addIgnoreBtn.click();
          closeDropdown();
        });

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

  newIgnoreInput.addEventListener('input', () => {
    showSuggestions(newIgnoreInput.value.trim().toLowerCase());
  });

  newIgnoreInput.addEventListener('focus', () => {
    showSuggestions(newIgnoreInput.value.trim().toLowerCase());
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

  document.addEventListener('mousedown', (e) => {
    if (!newIgnoreInput.contains(e.target) && !autocompleteDropdown.contains(e.target)) {
      closeDropdown();
    }
  });

  // --- 7. CONFIG & OVERRIDES EVENT LISTENERS ---
  timerSelect.addEventListener('change', () => {
    const val = parseFloat(timerSelect.value);
    chrome.storage.local.set({ hibernateAfterMinutes: val }, () => {
      if (chrome.runtime.lastError) {
        console.error('[RAMGuard] Error saving timeout:', chrome.runtime.lastError);
      } else {
        showToast('Hibernation timer updated', 'success');
        triggerRefresh();
      }
    });
  });

  autoHibernateToggle.addEventListener('change', () => {
    const isChecked = autoHibernateToggle.checked;
    chrome.storage.local.set({ autoHibernateEnabled: isChecked }, () => {
      if (timerCard) {
        timerCard.style.opacity = isChecked ? '1' : '0.5';
        timerCard.style.pointerEvents = isChecked ? 'auto' : 'none';
      }
      showToast(isChecked ? 'Auto-hibernate enabled' : 'Auto-hibernate disabled', 'success');
      triggerRefresh();
    });
  });

  let pauseCountdownInterval = null;
  function updatePauseButton() {
    chrome.storage.local.get(['pausedUntil'], (data) => {
      const pausedUntil = data.pausedUntil || 0;
      const now = Date.now();
      
      if (pausedUntil > now) {
        pauseToggle.checked = true;
        if (pauseCountdownInterval) clearInterval(pauseCountdownInterval);
        
        const tick = () => {
          const timeLeft = pausedUntil - Date.now();
          if (timeLeft <= 0) {
            clearInterval(pauseCountdownInterval);
            chrome.storage.local.set({ pausedUntil: 0 }, () => {
              updatePauseButton();
              triggerRefresh();
            });
          } else {
            const minutes = Math.floor(timeLeft / 60000);
            const seconds = Math.floor((timeLeft % 60000) / 1000);
            const timeStr = `${minutes}:${String(seconds).padStart(2, '0')}`;
            pauseTitle.textContent = `Hibernation Paused`;
            pauseSubTitle.textContent = `Resuming in ${timeStr}...`;
          }
        };
        tick();
        pauseCountdownInterval = setInterval(tick, 1000);
      } else {
        if (pauseCountdownInterval) {
          clearInterval(pauseCountdownInterval);
          pauseCountdownInterval = null;
        }
        pauseToggle.checked = false;
        pauseTitle.textContent = 'Pause Hibernation';
        pauseSubTitle.textContent = 'Temporarily pause all hibernation';
      }
    });
  }

  pauseToggle.addEventListener('change', () => {
    if (pauseToggle.checked) {
      const targetTime = Date.now() + 30 * 60 * 1000;
      chrome.storage.local.set({ pausedUntil: targetTime }, () => {
        updatePauseButton();
        showToast('Hibernation paused for 30 mins', 'success');
        triggerRefresh();
      });
    } else {
      chrome.storage.local.set({ pausedUntil: 0 }, () => {
        updatePauseButton();
        showToast('Hibernation resumed', 'success');
        triggerRefresh();
      });
    }
  });

  // Action Buttons
  hibernateNowBtn.addEventListener('click', () => {
    hibernateNowBtn.setAttribute('disabled', 'true');
    const originalText = hibernateNowBtn.textContent;
    hibernateNowBtn.textContent = 'Sleeping...';

    chrome.runtime.sendMessage({ command: 'hibernate-now' }, (response) => {
      hibernateNowBtn.removeAttribute('disabled');
      hibernateNowBtn.textContent = originalText;

      if (chrome.runtime.lastError) {
        showToast('Background worker failed to respond', 'error');
        return;
      }

      if (response && response.success) {
        const count = response.count || 0;
        const savedRAM = response.savedRAM || 0;
        if (count > 0) {
          showToast(`Hibernated ${count} tab${count === 1 ? '' : 's'} • ${savedRAM} MB saved`, 'success');
        } else {
          showToast('All tabs are already optimized', 'info');
        }
        triggerRefresh();
      } else {
        showToast('Error executing hibernation', 'error');
      }
    });
  });

  hibernateOtherBtn.addEventListener('click', () => {
    hibernateOtherBtn.setAttribute('disabled', 'true');
    const originalText = hibernateOtherBtn.textContent;
    hibernateOtherBtn.textContent = 'Sleeping...';

    chrome.runtime.sendMessage({ command: 'hibernate-other-tabs' }, (response) => {
      hibernateOtherBtn.removeAttribute('disabled');
      hibernateOtherBtn.textContent = originalText;

      if (chrome.runtime.lastError) {
        showToast('Background worker failed to respond', 'error');
        return;
      }

      if (response && response.success) {
        const count = response.count || 0;
        const savedRAM = response.savedRAM || 0;
        if (count > 0) {
          showToast(`Hibernated ${count} tab${count === 1 ? '' : 's'} in other windows • ${savedRAM} MB saved`, 'success');
        } else {
          showToast('No other background tabs to hibernate', 'info');
        }
        triggerRefresh();
      } else {
        showToast('Error executing hibernation', 'error');
      }
    });
  });

  wakeAllBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ command: 'wake-all' }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        showToast('Failed to wake tabs', 'error');
        return;
      }
      showToast(`Woke up ${response.count || 0} tabs globally`, 'success');
      triggerRefresh();
    });
  });

  wakeWindowBtn.addEventListener('click', () => {
    chrome.windows.getCurrent({ populate: false }, (win) => {
      if (chrome.runtime.lastError || !win) {
        showToast('Failed to identify window', 'error');
        return;
      }
      chrome.runtime.sendMessage({ command: 'wake-all', windowId: win.id }, (response) => {
        if (chrome.runtime.lastError || !response || !response.success) {
          showToast('Failed to wake tabs', 'error');
          return;
        }
        showToast(`Woke up ${response.count || 0} tabs in this window`, 'success');
        triggerRefresh();
      });
    });
  });

  clearHistoryBtn.addEventListener('click', () => {
    chrome.storage.local.set({ hibernationHistory: [] }, () => {
      if (chrome.runtime.lastError) {
        showToast('Failed to clear history log', 'error');
      } else {
        showToast('History log cleared successfully', 'success');
        triggerRefresh();
      }
    });
  });

  // --- 8. LIVE REFRESH STORAGE & TAB LISTENERS ---
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      triggerRefresh();
    }
  });

  chrome.tabs.onUpdated.addListener(() => triggerRefresh());
  chrome.tabs.onRemoved.addListener(() => triggerRefresh());
  chrome.tabs.onCreated.addListener(() => triggerRefresh());

  // Toast Helper
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

  // Initial Load
  refreshData();
});
