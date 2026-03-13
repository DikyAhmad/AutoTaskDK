// ─── State ──────────────────────────────────────────
let actions = [];
let isConnected = false;
let isPickerActive = false;
let pickerTargetFieldId = null;

// ─── Action Field Definitions ───────────────────────
const ACTION_CONFIG = {
  click: {
    icon: '🖱️',
    fields: [
      { id: 'selector', label: 'CSS Selector', type: 'text', placeholder: 'e.g. button.submit, #login-btn' },
    ],
  },
  type: {
    icon: '⌨️',
    fields: [
      { id: 'selector', label: 'CSS Selector', type: 'text', placeholder: 'e.g. input#username, .email-field' },
      { id: 'value', label: 'Text to Type', type: 'text', placeholder: 'Enter text value...' },
      { id: 'pressEnter', label: 'Press Enter after typing', type: 'checkbox', default: true },
    ],
  },
  read: {
    icon: '📖',
    fields: [
      { id: 'selector', label: 'CSS Selector', type: 'text', placeholder: 'e.g. h1, .product-price, table tr' },
    ],
  },
  wait: {
    icon: '⏳',
    fields: [
      { id: 'selector', label: 'CSS Selector', type: 'text', placeholder: 'e.g. .loading-done, #results' },
      { id: 'timeout', label: 'Timeout (s)', type: 'number', placeholder: '5' },
    ],
  },
  navigate: {
    icon: '🔗',
    fields: [
      { id: 'url', label: 'URL', type: 'text', placeholder: 'https://example.com' },
    ],
  },
  delay: {
    icon: '⏱️',
    fields: [
      { id: 'ms', label: 'Duration (s)', type: 'number', placeholder: '1' },
    ],
  },
};

// ─── DOM References ─────────────────────────────────
const $actionType = document.getElementById('action-type');
const $actionFields = document.getElementById('action-fields');
const $btnAdd = document.getElementById('btn-add-action');
const $actionList = document.getElementById('action-list');
const $btnRun = document.getElementById('btn-run');
const $btnClear = document.getElementById('btn-clear');
const $logList = document.getElementById('log-list');
const $btnClearLogs = document.getElementById('btn-clear-logs');
const $connectionStatus = document.getElementById('connection-status');
const $statusText = document.getElementById('status-text');
const $statusInfo = document.getElementById('status-info');

// ─── Window Controls ────────────────────────────────
document.getElementById('btn-minimize').addEventListener('click', () => window.electronAPI.minimize());
document.getElementById('btn-maximize').addEventListener('click', () => window.electronAPI.maximize());
document.getElementById('btn-close').addEventListener('click', () => window.electronAPI.close());

// ─── Dynamic Form Fields ────────────────────────────
function renderActionFields() {
  const type = $actionType.value;
  const config = ACTION_CONFIG[type];
  $actionFields.innerHTML = '';

  config.fields.forEach((field) => {
    const row = document.createElement('div');
    row.className = 'form-row';

    if (field.id === 'selector') {
      // Add pick button next to selector fields
      row.innerHTML = `
        <label for="field-${field.id}">${field.label}</label>
        <div class="input-with-pick">
          <input
            type="${field.type}"
            id="field-${field.id}"
            placeholder="${field.placeholder}"
            autocomplete="off"
          />
          <button type="button" class="btn-pick" id="btn-pick-${field.id}" title="Pick element from page">
            🎯
          </button>
        </div>
      `;
    } else if (field.type === 'checkbox') {
      row.className = 'form-row checkbox-row';
      row.innerHTML = `
        <label class="checkbox-container">
          <input
            type="checkbox"
            id="field-${field.id}"
            ${field.default ? 'checked' : ''}
          />
          <span class="checkbox-label">${field.label}</span>
        </label>
      `;
    } else {
      row.innerHTML = `
        <label for="field-${field.id}">${field.label}</label>
        <input
          type="${field.type}"
          id="field-${field.id}"
          placeholder="${field.placeholder}"
          autocomplete="off"
        />
      `;
    }

    $actionFields.appendChild(row);
  });

  // Attach pick button handlers
  config.fields.forEach((field) => {
    if (field.id === 'selector') {
      const pickBtn = document.getElementById(`btn-pick-${field.id}`);
      if (pickBtn) {
        pickBtn.addEventListener('click', () => startPicker(field.id));
      }
    }
  });
}

$actionType.addEventListener('change', renderActionFields);
renderActionFields(); // Initial render

// ─── Add Action ─────────────────────────────────────
$btnAdd.addEventListener('click', () => {
  const type = $actionType.value;
  const config = ACTION_CONFIG[type];
  const params = {};

  let valid = true;
  config.fields.forEach((field) => {
    const input = document.getElementById(`field-${field.id}`);
    if (field.type === 'checkbox') {
      params[field.id] = input.checked;
    } else {
      const val = input.value.trim();
      if (!val) {
        input.style.borderColor = 'var(--color-danger)';
        valid = false;
        setTimeout(() => (input.style.borderColor = ''), 1500);
      } else {
        let numericVal = parseInt(val, 10);
        // Convert seconds to ms for specific fields
        if (field.id === 'ms' || field.id === 'timeout') {
          numericVal = numericVal * 1000;
        }
        params[field.id] = field.type === 'number' ? numericVal : val;
      }
    }
  });

  if (!valid) return;

  actions.push({ type, params, icon: config.icon });
  renderActionList();
  clearFormFields();
  updateRunButton();
});

function clearFormFields() {
  const inputs = $actionFields.querySelectorAll('input');
  inputs.forEach((i) => (i.value = ''));
}

// ─── Render Action List ─────────────────────────────
function renderActionList() {
  if (actions.length === 0) {
    $actionList.innerHTML = `
      <div id="empty-state" class="empty-state">
        <span>🎯</span>
        <p>No actions yet. Add your first action above.</p>
      </div>
    `;
    return;
  }

  $actionList.innerHTML = actions
    .map((action, i) => {
      const paramStr = Object.entries(action.params)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ');

      return `
        <div class="action-item" data-index="${i}">
          <span class="action-index">${i + 1}</span>
          <span class="action-icon">${action.icon}</span>
          <div class="action-details">
            <div class="action-type">${action.type}</div>
            <div class="action-params">${paramStr}</div>
          </div>
          <button class="action-remove" onclick="removeAction(${i})" title="Remove">✕</button>
        </div>
      `;
    })
    .join('');
}

function removeAction(index) {
  actions.splice(index, 1);
  renderActionList();
  updateRunButton();
}

// Make removeAction globally accessible
window.removeAction = removeAction;

// ─── Run / Clear ────────────────────────────────────
function updateRunButton() {
  $btnRun.disabled = actions.length === 0 || !isConnected;
}

$btnRun.addEventListener('click', async () => {
  if (actions.length === 0) return;

  const taskActions = actions.map((a) => ({
    type: a.type,
    ...a.params,
  }));

  addLog('info', `▶ Running task with ${taskActions.length} action(s)...`);
  console.log('[DEBUG] Task Actions:', taskActions);
  const result = await window.electronAPI.executeTask(taskActions);

  if (!result.sent) {
    addLog('error', '✕ Failed to send — no extension connected');
  }
});

$btnClear.addEventListener('click', () => {
  actions = [];
  renderActionList();
  updateRunButton();
});

// ─── Logs ───────────────────────────────────────────
function addLog(level, message) {
  // Remove empty state
  const empty = $logList.querySelector('.log-empty');
  if (empty) empty.remove();

  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  const entry = document.createElement('div');
  entry.className = `log-entry log-${level}`;
  entry.innerHTML = `<span class="log-time">${time}</span>${escapeHtml(message)}`;
  $logList.appendChild(entry);
  $logList.scrollTop = $logList.scrollHeight;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

$btnClearLogs.addEventListener('click', () => {
  $logList.innerHTML = '<div class="log-empty">Waiting for actions…</div>';
});

// ─── Extension Status Listener ──────────────────────
window.electronAPI.onExtensionStatus((data) => {
  isConnected = data.connected;
  updateConnectionUI();
  updateRunButton();

  if (data.connected) {
    addLog('success', `✓ Extension connected (${data.clientCount} client(s))`);
  } else {
    addLog('warning', '⚠ Extension disconnected');
  }
});

function updateConnectionUI() {
  if (isConnected) {
    $connectionStatus.className = 'status-connected';
    $statusText.textContent = 'Connected';
    $statusInfo.textContent = 'Extension is ready';
  } else {
    $connectionStatus.className = 'status-disconnected';
    $statusText.textContent = 'Disconnected';
    $statusInfo.textContent = 'Install browser extension & refresh';
  }
}

// ─── Action Result Listener ─────────────────────────
window.electronAPI.onActionResult((data) => {
  if (data.type === 'task-progress') {
    const { step, total, action, status } = data;
    const prefix = `[${step}/${total}]`;

    if (status === 'start') {
      addLog('info', `${prefix} ⏳ ${action.type.toUpperCase()} — executing...`);
    } else if (status === 'success') {
      let msg = `${prefix} ✓ ${action.type.toUpperCase()} — done`;
      if (data.result) {
        msg += `: ${typeof data.result === 'string' ? data.result : JSON.stringify(data.result)}`;
      }
      addLog('success', msg);
    } else if (status === 'error') {
      addLog('error', `${prefix} ✕ ${action.type.toUpperCase()} — ${data.error}`);
    }
  } else if (data.type === 'task-complete') {
    addLog('success', `✓ Task completed! (${data.total} actions)`);
  } else if (data.type === 'task-error') {
    addLog('error', `✕ Task failed: ${data.error}`);
  } else if (data.type === 'result') {
    // Single action result
    if (data.success) {
      let msg = `✓ ${data.action} — done`;
      if (data.data) msg += `: ${JSON.stringify(data.data)}`;
      addLog('success', msg);
    } else {
      addLog('error', `✕ ${data.action} — ${data.error}`);
    }
  }
});

// ─── Init ───────────────────────────────────────────
(async () => {
  const status = await window.electronAPI.getStatus();
  isConnected = status.connected;
  updateConnectionUI();
  updateRunButton();
})();

// ─── Element Picker ─────────────────────────────────
async function startPicker(fieldId) {
  if (!isConnected) {
    addLog('error', '✕ Cannot pick — no extension connected');
    return;
  }

  isPickerActive = true;
  pickerTargetFieldId = fieldId;
  addLog('info', '🎯 Picker mode active — click an element in the browser');

  // Update pick button state
  const pickBtn = document.getElementById(`btn-pick-${fieldId}`);
  if (pickBtn) {
    pickBtn.classList.add('picking');
    pickBtn.textContent = '⏳';
  }

  const result = await window.electronAPI.startPicker();
  if (!result.sent) {
    addLog('error', '✕ Failed to start picker — extension not responding');
    resetPickerButton();
  }
}

function resetPickerButton() {
  isPickerActive = false;
  const pickBtn = document.getElementById(`btn-pick-${pickerTargetFieldId}`);
  if (pickBtn) {
    pickBtn.classList.remove('picking');
    pickBtn.textContent = '🎯';
  }
  pickerTargetFieldId = null;
}

window.electronAPI.onPickerResult((data) => {
  addLog('success', `✓ Picked: <${data.tag}> → ${data.selector}`);

  // Fill the selector input with the picked selector
  if (pickerTargetFieldId) {
    const input = document.getElementById(`field-${pickerTargetFieldId}`);
    if (input) {
      input.value = data.selector;
      input.style.borderColor = 'var(--color-success)';
      setTimeout(() => (input.style.borderColor = ''), 2000);
    }
  }

  resetPickerButton();
});

window.electronAPI.onPickerCancelled(() => {
  addLog('warning', '⚠ Picker cancelled');
  resetPickerButton();
});
