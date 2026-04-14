// ─── State ──────────────────────────────────────────
let actions = [];
let isConnected = false;
let isPickerActive = false;
let pickerTargetFieldId = null;
let editingIndex = null;
let selectorHistory = [];
let currentProject = ""; // Name of the active project
let projects = []; // List of available project names
let isTaskExecuting = false;

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
      { id: 'bulkDelay', label: 'Delay between bulk inputs (s)', type: 'text', placeholder: 'e.g. 10 or 10-15' },
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
      { id: 'ms', label: 'Duration (s)', type: 'text', placeholder: 'e.g. 5 or 5-10' },
    ],
  },
};

// ─── DOM References ─────────────────────────────────
const $actionType = document.getElementById('action-type');
const $actionFields = document.getElementById('action-fields');
const $btnAdd = document.getElementById('btn-add-action');
const $actionList = document.getElementById('action-list');
const $btnRun = document.getElementById('btn-run');
const $btnStop = document.getElementById('btn-stop');
const $btnClear = document.getElementById('btn-clear');
const $logList = document.getElementById('log-list');
const $btnClearLogs = document.getElementById('btn-clear-logs');
const $connectionStatus = document.getElementById('connection-status');
const $statusText = document.getElementById('status-text');
const $statusInfo = document.getElementById('status-info');

// ─── Project DOM Refs ───────────────────────────────
const $projectSelector = document.getElementById('project-selector');
const $btnNewProject = document.getElementById('btn-new-project');
const $btnRenameProject = document.getElementById('btn-rename-project');
const $btnSaveProject = document.getElementById('btn-save-project');
const $btnDeleteProject = document.getElementById('btn-delete-project');

// ─── Rename Project UI Refs ──────────────────────────
const $renameContainer = document.getElementById('project-rename-container');
const $renameInput = document.getElementById('project-rename-input');
const $btnRenameConfirm = document.getElementById('btn-rename-confirm');
const $btnRenameCancel = document.getElementById('btn-rename-cancel');

// ─── Modal Refs ─────────────────────────────────────
const $confirmModal = document.getElementById('confirm-modal');
const $modalTitle = document.getElementById('modal-title');
const $modalMessage = document.getElementById('modal-message');
const $btnModalConfirm = document.getElementById('btn-modal-confirm');
const $btnModalCancel = document.getElementById('btn-modal-cancel');

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
    $btnTheme.title = 'Switch to Dark Mode';
  } else {
    document.documentElement.classList.remove('light-theme');
    $btnTheme.textContent = '☀️';
    $btnTheme.title = 'Switch to Light Mode';
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
    row.className = 'form-row flex flex-col gap-1.5';

    if (field.id === 'selector') {
      // Add pick button next to selector fields
      row.innerHTML = `
        <label for="field-${field.id}">${field.label}</label>
        <div class="input-with-pick flex gap-2 items-stretch h-[44px]">
          <input
            type="${field.type}"
            id="field-${field.id}"
            placeholder="${field.placeholder}"
            autocomplete="off"
            list="selector-history-list"
            class="flex-1"
          />
          <button type="button" class="btn-pick w-12 flex items-center justify-center bg-surface border border-border rounded-sm text-text-dim text-base cursor-pointer transition-all hover:bg-primary-glow hover:border-primary hover:text-primary-light hover:shadow-[0_0_15px_var(--color-primary-glow)] hover:scale-105 active:scale-95 shrink-0" id="btn-pick-${field.id}" title="Pick element from page">
            🎯
          </button>
        </div>
      `;
    } else if (field.type === 'checkbox') {
      row.className = 'form-row checkbox-row flex items-center gap-2.5 mt-2 mb-1 py-1';
      row.innerHTML = `
        <label class="checkbox-container flex items-center gap-2.5 cursor-pointer select-none group">
          <input
            type="checkbox"
            id="field-${field.id}"
            class="w-4.5 h-4.5 cursor-pointer accent-primary"
            ${field.default ? 'checked' : ''}
          />
          <span class="checkbox-label text-[13px] font-semibold text-text group-hover:text-primary-light transition-colors">${field.label}</span>
        </label>
      `;
    } else if (field.type === 'textarea') {
      row.innerHTML = `
        <label for="field-${field.id}">${field.label}</label>
        <textarea
          id="field-${field.id}"
          placeholder="${field.placeholder}"
          autocomplete="off"
          class="min-h-[80px] resize-y p-3 leading-relaxed"
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
          class="h-[44px]"
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

function parseDuration(val) {
  if (!val) return 0;
  const s = String(val).trim();
  if (s.includes('-')) {
    const parts = s.split('-').map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p));
    if (parts.length >= 2) {
      const min = Math.min(parts[0], parts[1]);
      const max = Math.max(parts[0], parts[1]);
      // Return ms
      return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
    }
  }
  return (parseInt(s, 10) || 0) * 1000;
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
        // Special handling for potential ranges in duration fields
        if (field.id === 'ms' || field.id === 'bulkDelay') {
          // Store raw value for bulk processing later, OR parse now if not bulk
          params[field.id] = val; 
        } else {
          let numericVal = parseInt(val, 10);
          if (field.id === 'timeout') {
            numericVal = numericVal * 1000;
          }
          params[field.id] = field.type === 'number' ? numericVal : val;
        }

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
        if (idx > 0 && params.bulkDelay) {
          const delayMs = parseDuration(params.bulkDelay);
          if (delayMs > 0) {
            bulkActions.push({ type: 'delay', params: { ms: delayMs }, icon: ACTION_CONFIG.delay.icon });
          }
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
    if (params.bulkDelay !== undefined) delete params.bulkDelay;
    
    // Randomize if standalone delay is being edited
    if (type === 'delay' && params.ms) {
      params.ms = parseDuration(params.ms);
    }

    // Update existing action
    actions[editingIndex] = { type, params, icon: config.icon };
    addLog('info', `󰄬 Updated action ${editingIndex + 1}: ${type}`);
    cancelEdit();
  } else {
    if (params.isBulk !== undefined) delete params.isBulk;
    if (params.bulkDelay !== undefined) delete params.bulkDelay;
    
    // Final check for random delay in standalone action
    if (type === 'delay' && params.ms) {
      params.ms = parseDuration(params.ms);
    }
    
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
  // Save tasks to "last session" fallback
  window.electronAPI.saveTasks(actions);
  
  // If we have an active project, we might want to auto-save or wait for manual save
  // For now, let's keep it manual to avoid overwriting unless user clicks save

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
        <div class="action-item flex items-center gap-3 p-3 bg-surface/50 border border-border rounded-md transition-all animate-[slideIn_0.2s_ease-out] ${isEditing ? 'border-primary shadow-[0_0_20px_var(--color-primary-glow)] scale-[1.02] bg-surface' : 'hover:bg-surface-hover hover:border-border-light hover:translate-x-1'}" data-index="${i}">
          <span class="action-index w-7 h-7 flex items-center justify-center bg-primary text-white rounded-full text-[11px] font-black shrink-0 shadow-lg shadow-primary-glow">${i + 1}</span>
          <span class="action-icon text-lg shrink-0 drop-shadow-sm">${action.icon}</span>
          <div class="action-details flex-1 min-w-0 ml-1">
            <div class="action-type text-[12px] font-bold text-text uppercase tracking-wider mb-0.5">${action.type}</div>
            <div class="action-params text-[11px] text-text-dim truncate font-mono bg-black/20 px-1.5 py-0.5 rounded-sm inline-block max-w-full">${paramStr}</div>
          </div>
          <div class="action-controls flex gap-1.5 ml-auto shrink-0">
            <button class="action-btn w-8 h-8 flex items-center justify-center bg-surface border border-border text-text-dim rounded-md cursor-pointer transition-all hover:bg-primary-glow hover:text-primary-light hover:border-primary" onclick="editAction(${i})" title="Edit">✏️</button>
            <button class="action-btn w-8 h-8 flex items-center justify-center bg-surface border border-border text-text-dim rounded-md cursor-pointer transition-all hover:bg-danger-glow hover:text-danger hover:border-danger" onclick="removeAction(${i})" title="Remove">✕</button>
          </div>
        </div>
      `;
    })
    .join('');
}

function removeAction(index) {
  const action = actions[index];
  showConfirmModal(
    'Delete Action',
    `Are you sure you want to delete the "${action.type.toUpperCase()}" action?`,
    () => {
      if (editingIndex === index) {
        cancelEdit();
      }
      actions.splice(index, 1);
      addLog('info', `🗑️ Removed action: ${action.type.toUpperCase()}`);
      renderActionList();
      updateRunButton();
    }
  );
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
  
  setExecutionState(true);
  const result = await window.electronAPI.executeTask(taskActions);

  if (!result.sent) {
    addLog('error', '✕ Failed to send — no extension connected');
    setExecutionState(false);
  }
});

$btnStop.addEventListener('click', () => {
  showConfirmModal(
    'Stop Task',
    'Are you sure you want to stop the current task execution?',
    async () => {
      addLog('warning', '⏹ Stopping task...');
      await window.electronAPI.stopTask();
      // State will be updated via 'task-stopped' event
    },
    'Confirm Stop'
  );
});

function setExecutionState(executing) {
  isTaskExecuting = executing;
  if (executing) {
    $btnRun.classList.add('hidden');
    $btnStop.classList.remove('hidden');
  } else {
    $btnRun.classList.remove('hidden');
    $btnStop.classList.add('hidden');
    updateRunButton();
  }
}

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
  } else if (data.type === 'task-stopped') {
    addLog('warning', `⏹ Task stopped by user at step ${data.step}/${data.total}.`);
    setExecutionState(false);
  } else if (data.type === 'task-complete') {
    addLog('success', `✓ Task completed! (${data.total} actions)`);
    setExecutionState(false);
  } else if (data.type === 'task-error') {
    addLog('error', `✕ Task failed: ${data.error}`);
    setExecutionState(false);
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

// ─── Project Management ──────────────────────────────
async function loadProjects() {
  try {
    projects = await window.electronAPI.getProjects();
    
    // Auto-select first project if none active
    if (!currentProject && projects.length > 0) {
      currentProject = projects[0];
      const loadedActions = await window.electronAPI.loadProject(currentProject);
      if (loadedActions) {
        actions = loadedActions;
        renderActionList();
        updateRunButton();
      }
    }
    
    updateProjectSelectorUI();
  } catch (err) {
    console.error('Failed to load projects:', err);
  }
}

function updateProjectSelectorUI() {
  $projectSelector.innerHTML = '';
  
  if (projects.length === 0) {
    const opt = document.createElement('option');
    opt.value = "";
    opt.textContent = "-- No Project --";
    $projectSelector.appendChild(opt);
  }

  projects.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    if (p === currentProject) opt.selected = true;
    $projectSelector.appendChild(opt);
  });
}

// Switch project
$projectSelector.addEventListener('change', async () => {
  const selected = $projectSelector.value;
  if (selected === currentProject) return;

  if (selected === '') {
    currentProject = '';
    actions = [];
    renderActionList();
    updateRunButton();
    hideRenameUI();
    return;
  }

  const loadedActions = await window.electronAPI.loadProject(selected);
  if (loadedActions) {
    currentProject = selected;
    actions = loadedActions;
    addLog('info', `📂 Loaded project: ${selected}`);
  }
  renderActionList();
  updateRunButton();
});

// ➕ New Project
$btnNewProject.addEventListener('click', async () => {
  let num = 1;
  while (projects.includes(String(num))) num++;
  const name = String(num);

  const res = await window.electronAPI.saveProject(name, []);
  if (res.success) {
    currentProject = name;
    actions = [];
    if (!projects.includes(name)) projects.push(name);
    updateProjectSelectorUI();
    renderActionList();
    updateRunButton();
    hideRenameUI(); // Hide if active
    addLog('success', `➕ Created project: ${name}`);
  } else {
    addLog('error', `✕ Failed to create project: ${res.error}`);
  }
});

function showRenameUI() {
  if (!currentProject) return;
  $renameInput.value = currentProject;
  $renameContainer.classList.remove('hidden');
  $renameInput.focus();
  $renameInput.select();
}

function hideRenameUI() {
  $renameContainer.classList.add('hidden');
  $renameInput.value = '';
}

async function confirmRename() {
  const newName = $renameInput.value.trim();
  if (!newName || newName === currentProject) {
    hideRenameUI();
    return;
  }

  const safeName = newName.replace(/[^a-z0-9_\- ]/gi, '_');
  if (!safeName) return;

  const res = await window.electronAPI.renameProject(currentProject, safeName);
  if (res.success) {
    addLog('success', `✏️ Renamed: ${currentProject} → ${safeName}`);
    projects = projects.map(p => p === currentProject ? safeName : p);
    currentProject = safeName;
    updateProjectSelectorUI();
    hideRenameUI();
  } else {
    addLog('error', `✕ Rename failed: ${res.error}`);
  }
}

// ✏️ Rename Project Toggle
$btnRenameProject.addEventListener('click', () => {
  if (!currentProject) {
    addLog('warning', '⚠ Select a project first');
    return;
  }
  
  if ($renameContainer.classList.contains('hidden')) {
    showRenameUI();
  } else {
    hideRenameUI();
  }
});

$btnRenameConfirm.addEventListener('click', confirmRename);
$btnRenameCancel.addEventListener('click', hideRenameUI);
$renameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmRename();
  if (e.key === 'Escape') hideRenameUI();
});

// ─── Modal Helpers ──────────────────────────────────
let modalCallback = null;

function showConfirmModal(title, message, onConfirm, confirmText = 'Confirm Delete') {
  $modalTitle.textContent = title;
  $modalMessage.textContent = message;
  $btnModalConfirm.textContent = confirmText;
  
  if (confirmText === 'Confirm Stop') {
    $btnModalConfirm.classList.remove('bg-danger');
    $btnModalConfirm.classList.add('bg-warning', 'text-black');
  } else {
    $btnModalConfirm.classList.add('bg-danger');
    $btnModalConfirm.classList.remove('bg-warning', 'text-black');
  }

  modalCallback = onConfirm;
  $confirmModal.classList.remove('hidden');
}

function hideConfirmModal() {
  $confirmModal.classList.add('hidden');
  modalCallback = null;
}

$btnModalConfirm.addEventListener('click', () => {
  if (modalCallback) modalCallback();
  hideConfirmModal();
});

$btnModalCancel.addEventListener('click', hideConfirmModal);
$confirmModal.addEventListener('click', (e) => {
  if (e.target === $confirmModal) hideConfirmModal();
});

// 💾 Save Project
$btnSaveProject.addEventListener('click', async () => {
  if (!currentProject) {
    addLog('warning', '⚠ Select or create a project first');
    return;
  }

  const res = await window.electronAPI.saveProject(currentProject, actions);
  if (res.success) {
    addLog('success', `💾 Saved project: ${currentProject}`);
  } else {
    addLog('error', `✕ Save failed: ${res.error}`);
  }
});

// 🗑️ Delete Project
$btnDeleteProject.addEventListener('click', () => {
  if (!currentProject) {
    addLog('warning', '⚠ Select a project first');
    return;
  }

  showConfirmModal(
    'Delete Project',
    `Are you sure you want to delete project "${currentProject}"? All actions will be lost.`,
    async () => {
      const res = await window.electronAPI.deleteProject(currentProject);
      if (res.success) {
        addLog('info', `🗑️ Deleted project: ${currentProject}`);
        projects = projects.filter(p => p !== currentProject);
        
        if (projects.length > 0) {
          currentProject = projects[0];
          const loadedActions = await window.electronAPI.loadProject(currentProject);
          actions = loadedActions || [];
        } else {
          currentProject = '';
          actions = [];
        }
        
        updateProjectSelectorUI();
        renderActionList();
        updateRunButton();
      } else {
        addLog('error', `✕ Delete failed: ${res.error}`);
      }
    }
  );
});

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
      addLog('info', `📦 Loaded ${actions.length} saved action(s)`);
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
loadProjects();
