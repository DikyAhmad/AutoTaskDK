// ─── Auto Click UI — Background Service Worker ─────
// Connects to Electron's WebSocket server and relays
// commands to the content script running in active tabs.

let ws = null;
let reconnectTimer = null;
const WS_URL = 'ws://localhost:8765';
const RECONNECT_INTERVAL = 3000;
const KEEPALIVE_ALARM = 'ws-keepalive';

let isManualDisconnect = false;
let initPromise = null;

function waitForInit() {
  if (initPromise) return initPromise;
  initPromise = new Promise((resolve) => {
    chrome.storage.local.get(['isManualDisconnect'], (result) => {
      isManualDisconnect = !!result.isManualDisconnect;
      console.log('[AutoClick] Storage loaded. Manual disconnect:', isManualDisconnect);
      resolve();
    });
  });
  return initPromise;
}

// ─── Keepalive (prevent service worker termination) ──
chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    await waitForInit();
    // Just keep the service worker alive
    if (!isManualDisconnect && (!ws || ws.readyState !== WebSocket.OPEN)) {
      connect();
    }
  }
});

// ─── WebSocket Connection ───────────────────────────
function connect() {
  if (isManualDisconnect) return;
  if (ws && ws.readyState === WebSocket.OPEN) return;

  // Clean up any existing connection
  if (ws) {
    try { ws.close(); } catch (e) {}
    ws = null;
  }

  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('[AutoClick] Connected to Electron');
      clearTimeout(reconnectTimer);
      broadcastStatus(true);
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log('[AutoClick] Received:', msg);

        if (msg.type === 'execute') {
          await executeAction(msg.action);
        } else if (msg.type === 'execute-task') {
          await executeTask(msg.actions);
        } else if (msg.type === 'start-picker') {
          const tab = await getActiveTab();
          if (tab) {
            // Focus the browser window
            chrome.windows.update(tab.windowId, { focused: true });
            
            await ensureContentScript(tab.id);
            chrome.tabs.sendMessage(tab.id, { type: 'start-picker' });
          }
        }
      } catch (err) {
        console.error('[AutoClick] Message parse error:', err);
      }
    };

    ws.onclose = () => {
      console.log('[AutoClick] Disconnected');
      ws = null;
      broadcastStatus(false);
      if (!isManualDisconnect) scheduleReconnect();
    };

    ws.onerror = () => {
      // Don't log error object (it's not serializable in service workers)
      console.log('[AutoClick] WS connection error');
      try { ws?.close(); } catch (e) {}
    };
  } catch (err) {
    console.error('[AutoClick] Connection error:', err.message);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (isManualDisconnect) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, RECONNECT_INTERVAL);
}

function sendToElectron(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// ─── Broadcast Status to Popup ──────────────────────
function broadcastStatus(connected) {
  const status = {
    type: 'status',
    connected: !!connected,
    isManualDisconnect: !!isManualDisconnect
  };
  chrome.runtime.sendMessage(status).catch(() => {});
}

// ─── Get Active Tab ─────────────────────────────────
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// ─── Ensure Content Script Is Injected ──────────────
async function ensureContentScript(tabId) {
  try {
    // Try sending a ping to check if content script is loaded
    const reply = await chrome.tabs.sendMessage(tabId, { type: 'ping' });
    if (reply && reply.pong) return; // Already loaded
  } catch {
    // Content script not loaded — inject it programmatically
    console.log('[AutoClick] Injecting content script into tab', tabId);
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
      });
      // Wait for content script to initialize
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.error('[AutoClick] Failed to inject content script:', err.message);
    }
  }
}

// ─── Execute Single Action ──────────────────────────
async function executeAction(action) {
  try {
    const tab = await getActiveTab();
    if (!tab) {
      sendToElectron({ type: 'result', action: action.type, success: false, error: 'No active tab' });
      return;
    }

    // Handle navigate at the background level
    if (action.type === 'navigate') {
      await chrome.tabs.update(tab.id, { url: action.url });
      sendToElectron({ type: 'result', action: 'navigate', success: true, data: action.url });
      return;
    }

    // Handle delay at the background level
    if (action.type === 'delay') {
      await new Promise((r) => setTimeout(r, action.ms || 1000));
      sendToElectron({ type: 'result', action: 'delay', success: true, data: `${action.ms}ms` });
      return;
    }

    // Ensure content script is loaded before sending DOM actions
    await ensureContentScript(tab.id);

    // Send to content script for DOM actions
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'execute',
      action,
    });

    if (response) {
      sendToElectron({ type: 'result', ...response });
    } else {
      sendToElectron({ type: 'result', action: action.type, success: false, error: 'No response from content script' });
    }
  } catch (err) {
    sendToElectron({
      type: 'result',
      action: action.type,
      success: false,
      error: err.message,
    });
  }
}

// ─── Execute Task (Sequential Actions) ──────────────
async function executeTask(actions) {
  const total = actions.length;

  for (let i = 0; i < total; i++) {
    const action = actions[i];
    const step = i + 1;

    // Progress: start
    sendToElectron({
      type: 'task-progress',
      step,
      total,
      action,
      status: 'start',
    });

    try {
      const tab = await getActiveTab();
      if (!tab) throw new Error('No active tab');

      let result = null;

      if (action.type === 'navigate') {
        await chrome.tabs.update(tab.id, { url: action.url });
        // Wait for page to load
        await new Promise((resolve) => {
          const listener = (tabId, changeInfo) => {
            if (tabId === tab.id && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
          setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }, 15000);
        });
        result = action.url;
      } else if (action.type === 'delay') {
        await new Promise((r) => setTimeout(r, action.ms || 1000));
        result = `${action.ms}ms`;
      } else {
        // DOM actions via content script
        await ensureContentScript(tab.id);

        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'execute',
          action,
        });

        if (!response) {
          throw new Error('No response from content script — try refreshing the page');
        }
        if (!response.success) {
          throw new Error(response.error || 'Action failed');
        }
        result = response.data;
      }

      // Progress: success
      sendToElectron({
        type: 'task-progress',
        step,
        total,
        action,
        status: 'success',
        result,
      });
    } catch (err) {
      sendToElectron({
        type: 'task-progress',
        step,
        total,
        action,
        status: 'error',
        error: err.message,
      });

      sendToElectron({
        type: 'task-error',
        error: `Failed at step ${step}: ${err.message}`,
        step,
        total,
      });
      return;
    }
  }

  sendToElectron({ type: 'task-complete', total });
}

// ─── Message Listener (from popup & content script) ─
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    await waitForInit();

    if (msg.type === 'get-status') {
      sendResponse({
        connected: ws && ws.readyState === WebSocket.OPEN,
        isManualDisconnect,
      });
    } else if (msg.type === 'toggle-manual-disconnect') {
      isManualDisconnect = msg.value;
      await chrome.storage.local.set({ isManualDisconnect });
      
      if (isManualDisconnect) {
        if (ws) {
          try { ws.close(); } catch (e) {}
          ws = null;
        }
        clearTimeout(reconnectTimer);
        broadcastStatus(false);
      } else {
        connect();
      }
      sendResponse({ ok: true });
    } else if (msg.type === 'reconnect') {
      if (!isManualDisconnect) connect();
      sendResponse({ ok: true });
    } else if (msg.type === 'picker-result') {
      sendToElectron({
        type: 'picker-result',
        selector: msg.selector,
        tag: msg.tag,
        text: msg.text,
        id: msg.id,
        classes: msg.classes,
      });
    } else if (msg.type === 'picker-cancelled') {
      sendToElectron({ type: 'picker-cancelled' });
    }
  })();
  return true; // Keep channel open for async sendResponse
});

// ─── Init ───────────────────────────────────────────
waitForInit().then(() => {
  if (!isManualDisconnect) {
    connect();
  }
});
