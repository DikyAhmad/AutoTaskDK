// ─── Auto Click UI — Background Service Worker ─────
// Connects to Electron's WebSocket server and relays
// commands to the content script running in active tabs.

let ws = null;
let reconnectTimer = null;
const WS_URL = 'ws://localhost:8765';
const RECONNECT_INTERVAL = 3000;

// ─── WebSocket Connection ───────────────────────────
function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

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
        }
      } catch (err) {
        console.error('[AutoClick] Message parse error:', err);
      }
    };

    ws.onclose = () => {
      console.log('[AutoClick] Disconnected');
      ws = null;
      broadcastStatus(false);
      scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.error('[AutoClick] WS Error:', err);
      ws?.close();
    };
  } catch (err) {
    console.error('[AutoClick] Connection error:', err);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
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
  chrome.runtime.sendMessage({
    type: 'status',
    connected,
  }).catch(() => {}); // Popup may not be open
}

// ─── Get Active Tab ─────────────────────────────────
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
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

    // Send to content script for DOM actions
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'execute',
      action,
    });

    sendToElectron({ type: 'result', ...response });
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
          // Timeout safety
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
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'execute',
          action,
        });

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
      // Progress: error
      sendToElectron({
        type: 'task-progress',
        step,
        total,
        action,
        status: 'error',
        error: err.message,
      });

      // Stop task on error
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

// ─── Message Listener (from popup) ──────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'get-status') {
    sendResponse({
      connected: ws && ws.readyState === WebSocket.OPEN,
    });
    return true;
  }

  if (msg.type === 'reconnect') {
    connect();
    sendResponse({ ok: true });
    return true;
  }
});

// ─── Init ───────────────────────────────────────────
connect();
