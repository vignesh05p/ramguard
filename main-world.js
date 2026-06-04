// main-world.js
// Runs in the MAIN world to intercept APIs not accessible in the isolated content script world.

(function() {
  const activePCs = new Set();
  const activeStreams = new Set();
  const activeRequests = new Set();
  let customOnBeforeUnload = null;
  const beforeUnloadListeners = new Set();

  function notifyStateChange() {
    window.postMessage({
      type: 'RAMGUARD_STATE_UPDATE',
      hasActiveWebRTC: hasActiveWebRTC() || hasActiveUserMedia(),
      hasActiveNetwork: hasActiveNetwork(),
      hasBeforeUnload: hasBeforeUnload()
    }, '*');
  }

  function hasActiveWebRTC() {
    if (activePCs.size > 0) {
      for (const pc of activePCs) {
        if (['connecting', 'connected'].includes(pc.connectionState) || ['checking', 'connected'].includes(pc.iceConnectionState)) {
          return true;
        }
      }
    }
    return false;
  }

  function hasActiveUserMedia() {
    for (const stream of activeStreams) {
      if (stream.getTracks().some(track => track.readyState === 'live')) {
        return true;
      }
    }
    return false;
  }

  function hasActiveNetwork() {
    const now = Date.now();
    for (const req of activeRequests) {
      if (now - req.startTime < 30000) {
        return true;
      }
    }
    return false;
  }

  function hasBeforeUnload() {
    return typeof customOnBeforeUnload === 'function' || beforeUnloadListeners.size > 0;
  }

  // Intercept RTCPeerConnection
  const OriginalRTCPeerConnection = window.RTCPeerConnection;
  if (OriginalRTCPeerConnection) {
    window.RTCPeerConnection = function(...args) {
      const pc = new OriginalRTCPeerConnection(...args);
      activePCs.add(pc);
      const updateState = () => {
        if (pc.connectionState === 'closed' || pc.iceConnectionState === 'closed') {
          activePCs.delete(pc);
        }
        notifyStateChange();
      };
      pc.addEventListener('connectionstatechange', updateState);
      pc.addEventListener('iceconnectionstatechange', updateState);
      const originalClose = pc.close;
      pc.close = function() {
        activePCs.delete(pc);
        notifyStateChange();
        return originalClose.apply(this, arguments);
      };
      return pc;
    };
    window.RTCPeerConnection.prototype = OriginalRTCPeerConnection.prototype;
    for (const prop in OriginalRTCPeerConnection) {
      if (OriginalRTCPeerConnection.hasOwnProperty(prop)) {
        window.RTCPeerConnection[prop] = OriginalRTCPeerConnection[prop];
      }
    }
  }

  // Intercept getUserMedia
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
    navigator.mediaDevices.getUserMedia = async function(constraints) {
      const stream = await originalGetUserMedia.call(navigator.mediaDevices, constraints);
      activeStreams.add(stream);
      const trackEnded = () => {
        if (stream.getTracks().every(track => track.readyState === 'ended')) {
          activeStreams.delete(stream);
          notifyStateChange();
        }
      };
      stream.getTracks().forEach(track => {
        track.addEventListener('ended', trackEnded);
      });
      notifyStateChange();
      return stream;
    };
  }

  // Intercept Fetch
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const req = { id: Math.random(), startTime: Date.now() };
    activeRequests.add(req);
    notifyStateChange();
    return originalFetch(...args).finally(() => {
      activeRequests.delete(req);
      notifyStateChange();
    });
  };

  // Intercept XHR
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._method = method;
    this._url = url;
    return originalOpen.apply(this, [method, url, ...args]);
  };
  XMLHttpRequest.prototype.send = function(...args) {
    const req = { id: this, startTime: Date.now() };
    activeRequests.add(req);
    notifyStateChange();
    const cleanup = () => {
      activeRequests.delete(req);
      notifyStateChange();
    };
    this.addEventListener('loadend', cleanup);
    return originalSend.apply(this, args);
  };

  // Intercept beforeunload
  const originalAddEventListener = window.addEventListener;
  const originalRemoveEventListener = window.removeEventListener;
  window.addEventListener = function(type, listener, options) {
    if (type === 'beforeunload') {
      beforeUnloadListeners.add(listener);
      notifyStateChange();
    }
    return originalAddEventListener.call(this, type, listener, options);
  };
  window.removeEventListener = function(type, listener, options) {
    if (type === 'beforeunload') {
      beforeUnloadListeners.delete(listener);
      notifyStateChange();
    }
    return originalRemoveEventListener.call(this, type, listener, options);
  };

  Object.defineProperty(window, 'onbeforeunload', {
    get() { return customOnBeforeUnload; },
    set(fn) {
      customOnBeforeUnload = fn;
      notifyStateChange();
    },
    configurable: true,
    enumerable: true
  });

  // Periodically post state just in case
  setInterval(notifyStateChange, 5000);
})();
