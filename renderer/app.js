// ─── State ──────────────────────────────────────────
let actions = [];
let isConnected = false;
let isPickerActive = false;
let pickerTargetFieldId = null;
let editingIndex = null;
let selectorHistory = [];

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
      { id: 'isBulk', label: 'Bulk Mode (one action per line)', type: 'checkbox', default: false },
      { id: 'bulkDelay', label: 'Delay between bulk inputs (s)', type: 'number', placeholder: '0' },
      { id: 'value', label: 'Text to Type', type: 'textarea', placeholder: 'Enter text value...\nIn Bulk Mode, each line creates a new action.' },
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

// --- Theme Management ---
const $btnTheme = document.getElementById('btn-theme');

function setTheme(theme) {
  if (theme === 'light') {
    document.documentElement.classList.add('light-theme');
    $btnTheme.textContent = '🌙';
  } else {
    document.documentElement.classList.remove('light-theme');
    $btnTheme.textContent = '☀️';
  }
  localStorage.setItem('autotask-theme', theme);
}

function toggleTheme() {
  const isLight = document.documentElement.classList.contains('light-theme');
  setTheme(isLight ? 'dark' : 'light');
}

$btnTheme.addEventListener('click', toggleTheme);

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
            list="selector-history-list"
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
    } else if (field.type === 'textarea') {
      row.innerHTML = `
        <label for="field-${field.id}">${field.label}</label>
        <textarea
          id="field-${field.id}"
          placeholder="${field.placeholder}"
          autocomplete="off"
        ></textarea>
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
        if (field.id === 'ms' || field.id === 'timeout' || field.id === 'bulkDelay') {
          numericVal = numericVal * 1000;
        }
        params[field.id] = field.type === 'number' ? numericVal : val;

        // Add to history if it's a selector
        if (field.id === 'selector') {
          addToSelectorHistory(val);
        }
      }
    }
  });

  if (!valid) return;

  // Handle Bulk Mode for 'type' action
  if (type === 'type' && params.isBulk) {
    const lines = params.value.split('\n').map(l => l.trim()).filter(l => l);
    
    if (lines.length > 0) {
      const bulkActions = [];
      lines.forEach((line, idx) => {
        const bp = { ...params, value: line };
        delete bp.isBulk;
        delete bp.bulkDelay;
        
        // Add delay EXCEPT before the first item of a NEW bulk set
        // (If editing, we might want delay even for the first item if it's not the first in the list, 
        // but let's keep it simple: delay between items in this bulk set)
        if (idx > 0 && params.bulkDelay > 0) {
          bulkActions.push({ type: 'delay', params: { ms: params.bulkDelay }, icon: ACTION_CONFIG.delay.icon });
        }
        bulkActions.push({ type, params: bp, icon: config.icon });
      });

      if (editingIndex !== null) {
        // Replace current item and insert the rest
        actions.splice(editingIndex, 1, ...bulkActions);
        addLog('info', `󰄬 Updated and processed bulk actions at position ${editingIndex + 1}`);
        cancelEdit();
      } else {
        // Add all as new actions
        actions.push(...bulkActions);
        addLog('success', `󰄬 Added ${lines.length} bulk actions`);
      }
      renderActionList();
      clearFormFields();
      updateRunButton();
      return;
    }
  }

  if (editingIndex !== null) {
    if (params.isBulk !== undefined) delete params.isBulk;
    if (params.bulkDelay !== undefined) delete params.bulkDelay;
    // Update existing action
    actions[editingIndex] = { type, params, icon: config.icon };
    addLog('info', `󰄬 Updated action ${editingIndex + 1}: ${type}`);
    cancelEdit();
  } else {
    if (params.isBulk !== undefined) delete params.isBulk;
    if (params.bulkDelay !== undefined) delete params.bulkDelay;
    // Add new action
    actions.push({ type, params, icon: config.icon });
    addLog('success', `󰄬 Added action: ${type}`);
  }

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
  // Save tasks whenever list changes
  window.electronAPI.saveTasks(actions);

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

      const isEditing = editingIndex === i;

      return `
        <div class="action-item ${isEditing ? 'editing' : ''}" data-index="${i}">
          <span class="action-index">${i + 1}</span>
          <span class="action-icon">${action.icon}</span>
          <div class="action-details">
            <div class="action-type">${action.type}</div>
            <div class="action-params">${paramStr}</div>
          </div>
          <div class="action-controls">
            <button class="action-btn action-btn-edit" onclick="editAction(${i})" title="Edit">✏️</button>
            <button class="action-btn action-btn-remove" onclick="removeAction(${i})" title="Remove">✕</button>
          </div>
        </div>
      `;
    })
    .join('');
}

function removeAction(index) {
  if (editingIndex === index) {
    cancelEdit();
  }
  actions.splice(index, 1);
  renderActionList();
  updateRunButton();
}

function editAction(index) {
  const action = actions[index];
  editingIndex = index;

  // Set dropdown to action type
  $actionType.value = action.type;
  renderActionFields();

  // Populate fields
  const config = ACTION_CONFIG[action.type];
  config.fields.forEach((field) => {
    const input = document.getElementById(`field-${field.id}`);
    if (input) {
      const val = action.params[field.id];
      if (field.type === 'checkbox') {
        input.checked = !!val;
      } else if (field.id === 'ms' || field.id === 'timeout') {
        // Convert ms back to seconds for UI
        input.value = val / 1000;
      } else {
        input.value = val;
      }
    }
  });

  // Update UI
  document.getElementById('action-form').classList.add('editing');
  $btnAdd.innerHTML = '<span>󰄬</span> Update Action';
  
  // Scroll form into view
  document.getElementById('task-panel').scrollTop = 0;
  
  renderActionList(); // Refresh list to show highlight
}

function cancelEdit() {
  editingIndex = null;
  document.getElementById('action-form').classList.remove('editing');
  $btnAdd.innerHTML = '<span>＋</span> Add Action';
  clearFormFields();
  renderActionList();
}

document.getElementById('btn-cancel-edit').addEventListener('click', cancelEdit);

// Make functions globally accessible
window.removeAction = removeAction;
window.editAction = editAction;
window.cancelEdit = cancelEdit;

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
      
      // Also add to history
      addToSelectorHistory(data.selector);
    }
  }

  resetPickerButton();
});

// ─── Selector History ──────────────────────────────
async function loadSelectorHistory() {
  try {
    const stored = await window.electronAPI.loadSelectors();
    if (stored && Array.isArray(stored)) {
      selectorHistory = stored;
      updateSelectorHistoryUI();
    }
  } catch (err) {
    console.error('Failed to load selector history:', err);
  }
}

function addToSelectorHistory(selector) {
  if (!selector || typeof selector !== 'string') return;
  const s = selector.trim();
  if (!s) return;

  // Keep it unique and move to front
  selectorHistory = [s, ...selectorHistory.filter((item) => item !== s)];
  
  // Keep last 50 items
  if (selectorHistory.length > 50) {
    selectorHistory = selectorHistory.slice(0, 50);
  }

  updateSelectorHistoryUI();
  window.electronAPI.saveSelectors(selectorHistory);
}

function updateSelectorHistoryUI() {
  const datalist = document.getElementById('selector-history-list');
  if (!datalist) return;
  
  datalist.innerHTML = selectorHistory
    .map(s => `<option value="${s}">`)
    .join('');
}

window.electronAPI.onPickerCancelled(() => {
  addLog('warning', '⚠ Picker cancelled');
  resetPickerButton();
});

// ─── Persistence ────────────────────────────────────
async function loadStoredTasks() {
  try {
    const stored = await window.electronAPI.loadTasks();
    if (stored && Array.isArray(stored) && stored.length > 0) {
      actions = stored;
      renderActionList();
      updateRunButton();
      addLog('info', `󰄬 Loaded ${actions.length} saved action(s)`);
    }
  } catch (err) {
    console.error('Failed to load tasks:', err);
  }
}

// ─── Initialization ─────────────────────────────────
const savedTheme = localStorage.getItem('autotask-theme') || 'dark';
setTheme(savedTheme);

renderActionFields();
loadStoredTasks();
loadSelectorHistory();
