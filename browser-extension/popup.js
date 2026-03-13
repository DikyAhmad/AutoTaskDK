// ─── Popup Script ───────────────────────────────────
const $dot = document.getElementById('status-dot');
const $label = document.getElementById('status-label');
const $desc = document.getElementById('status-desc');
const $btnReconnect = document.getElementById('btn-reconnect');

function updateUI(connected) {
  if (connected) {
    $dot.className = 'status-dot connected';
    $label.className = 'status-label connected';
    $label.textContent = 'Connected';
    $desc.textContent = 'Linked to Auto Click UI desktop app';
  } else {
    $dot.className = 'status-dot disconnected';
    $label.className = 'status-label disconnected';
    $label.textContent = 'Disconnected';
    $desc.textContent = 'Not connected to desktop app';
  }
}

// Get initial status
chrome.runtime.sendMessage({ type: 'get-status' }, (response) => {
  if (response) {
    updateUI(response.connected);
  }
});

// Listen for status updates from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'status') {
    updateUI(msg.connected);
  }
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
