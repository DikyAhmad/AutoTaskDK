// ─── Popup Script ───────────────────────────────────
const $dot = document.getElementById('status-dot');
const $label = document.getElementById('status-label');
const $desc = document.getElementById('status-desc');
const $btnReconnect = document.getElementById('btn-reconnect');
const $toggleConnect = document.getElementById('toggle-connect');

function updateUI(connected, isManualDisconnect) {
  $toggleConnect.checked = !isManualDisconnect;

  if (isManualDisconnect) {
    $dot.className = 'status-dot disconnected';
    $label.className = 'status-label disconnected';
    $label.textContent = 'Paused';
    $desc.textContent = 'Manually disconnected';
    $btnReconnect.disabled = true;
    $btnReconnect.style.opacity = '0.5';
  } else if (connected) {
    $dot.className = 'status-dot connected';
    $label.className = 'status-label connected';
    $label.textContent = 'Connected';
    $desc.textContent = 'Linked to Auto Click UI desktop app';
    $btnReconnect.disabled = false;
    $btnReconnect.style.opacity = '1';
  } else {
    $dot.className = 'status-dot disconnected';
    $label.className = 'status-label disconnected';
    $label.textContent = 'Disconnected';
    $desc.textContent = 'Not connected to desktop app';
    $btnReconnect.disabled = false;
    $btnReconnect.style.opacity = '1';
  }
}

// Get initial status
chrome.runtime.sendMessage({ type: 'get-status' }, (response) => {
  if (response) {
    updateUI(response.connected, response.isManualDisconnect);
  }
});

// Listen for status updates from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'status') {
    updateUI(msg.connected, msg.isManualDisconnect);
  }
});

// Toggle switch
$toggleConnect.addEventListener('change', () => {
  const isPaused = !$toggleConnect.checked;
  
  // Optimistic UI update
  updateUI(false, isPaused);

  chrome.runtime.sendMessage({ 
    type: 'toggle-manual-disconnect', 
    value: isPaused 
  });
});

// Reconnect button
$btnReconnect.addEventListener('click', () => {
  $btnReconnect.textContent = '⏳ Connecting...';
  $btnReconnect.disabled = true;

  chrome.runtime.sendMessage({ type: 'reconnect' }, () => {
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'get-status' }, (response) => {
        if (response) updateUI(response.connected);
        $btnReconnect.textContent = '🔄 Reconnect';
        $btnReconnect.disabled = false;
      });
    }, 1500);
  });
});
