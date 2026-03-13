// ─── Auto Click UI — Content Script ─────────────────
// Executes DOM actions (click, type, read, wait) on
// the current page, dispatched by the background worker.

// ─── Guard against double injection ─────────────────
if (window.__autoclick_content_loaded) {
  console.log('[AutoClick] Content script already loaded, skipping.');
} else {
  window.__autoclick_content_loaded = true;

// ─── Action Handlers ────────────────────────────────
const handlers = {
  click: (action) => {
    const el = document.querySelector(action.selector);
    if (!el) {
      return { success: false, action: 'click', error: `Element not found: ${action.selector}` };
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { success: true, action: 'click', data: action.selector };
  },

  type: (action) => {
    const el = document.querySelector(action.selector);
    if (!el) {
      return { success: false, action: 'type', error: `Element not found: ${action.selector}` };
    }

    el.focus();

    // Use the correct native setter based on element type
    let nativeSetter = null;
    const tagName = el.tagName.toLowerCase();

    if (tagName === 'textarea') {
      nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      )?.set;
    } else if (tagName === 'input') {
      nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set;
    }

    // Clear existing value
    if (nativeSetter) {
      nativeSetter.call(el, '');
    } else {
      el.value = '';
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));

    // Set new value
    if (nativeSetter) {
      nativeSetter.call(el, action.value);
    } else {
      el.value = action.value;
    }

    // Trigger all events that frameworks listen to
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Core keyboard events
    const baseOptions = { bubbles: true, cancelable: true, key: action.value.slice(-1), charCode: 0 };
    el.dispatchEvent(new KeyboardEvent('keydown', baseOptions));
    el.dispatchEvent(new KeyboardEvent('keypress', baseOptions));
    el.dispatchEvent(new KeyboardEvent('keyup', baseOptions));

    // Simulate Enter key if requested
    if (action.pressEnter) {
      console.log('[AutoClick] Simulating Enter key...');
      
      const enterOptions = { 
        bubbles: true, 
        cancelable: true, 
        key: 'Enter', 
        code: 'Enter', 
        keyCode: 13, 
        which: 13,
        view: window
      };

      // Robust event dispatch
      const dispatchEnter = (type) => {
        const ev = new KeyboardEvent(type, enterOptions);
        // Force legacy properties
        Object.defineProperty(ev, 'keyCode', { get: () => 13 });
        Object.defineProperty(ev, 'which', { get: () => 13 });
        el.dispatchEvent(ev);
        return ev;
      };

      const keydownEv = dispatchEnter('keydown');
      dispatchEnter('keypress');
      dispatchEnter('keyup');

      // If keydown wasn't cancelled, try submitting form
      if (!keydownEv.defaultPrevented) {
        const form = el.form || el.closest('form');
        if (form) {
          console.log('[AutoClick] Submitting form...');
          try {
            // requestSubmit is better as it triggers validation and submit events
            if (typeof form.requestSubmit === 'function') {
              form.requestSubmit();
            } else {
              form.submit();
            }
          } catch (e) {
            console.log('[AutoClick] Form submit failed, using events only');
          }
        }
      }
    }

    return { 
      success: true, 
      action: 'type', 
      data: `Typed "${action.value}"${action.pressEnter ? ' + Enter' : ''} → ${action.selector}`,
      details: action.pressEnter ? 'Enter key simulated and form submit attempted' : ''
    };
  },

  read: (action) => {
    const els = document.querySelectorAll(action.selector);
    if (els.length === 0) {
      return { success: false, action: 'read', error: `No elements found: ${action.selector}` };
    }

    const results = Array.from(els).map((el, i) => ({
      index: i,
      text: el.textContent?.trim() || '',
      tag: el.tagName.toLowerCase(),
    }));

    return {
      success: true,
      action: 'read',
      data: results.length === 1 ? results[0].text : results,
    };
  },

  wait: (action) => {
    return new Promise((resolve) => {
      const timeout = action.timeout || 5000;

      if (document.querySelector(action.selector)) {
        resolve({ success: true, action: 'wait', data: `Found: ${action.selector}` });
        return;
      }

      const observer = new MutationObserver(() => {
        if (document.querySelector(action.selector)) {
          observer.disconnect();
          resolve({ success: true, action: 'wait', data: `Found: ${action.selector}` });
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
      });

      setTimeout(() => {
        observer.disconnect();
        if (document.querySelector(action.selector)) {
          resolve({ success: true, action: 'wait', data: `Found: ${action.selector}` });
        } else {
          resolve({
            success: false,
            action: 'wait',
            error: `Timeout (${timeout}ms): Element not found — ${action.selector}`,
          });
        }
      }, timeout);
    });
  },
};

// ─── Element Picker ─────────────────────────────────
let pickerActive = false;
let pickerOverlay = null;
let pickerTooltip = null;
let currentHovered = null;

function generateSelector(el) {
  if (el.id) {
    return `#${CSS.escape(el.id)}`;
  }

  const parts = [];
  let current = el;

  while (current && current !== document.body && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();

    if (current.classList.length > 0) {
      const meaningfulClasses = Array.from(current.classList)
        .filter(c => !c.match(/^[a-z]{1,2}-/) && c.length < 30)
        .slice(0, 2);
      if (meaningfulClasses.length > 0) {
        selector += '.' + meaningfulClasses.map(c => CSS.escape(c)).join('.');
      }
    }

    const testSelector = [...parts, selector].reverse().join(' > ');
    try {
      const matches = document.querySelectorAll(testSelector);
      if (matches.length === 1) {
        parts.push(selector);
        break;
      }
    } catch { /* invalid selector, continue */ }

    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        s => s.tagName === current.tagName
      );
      if (siblings.length > 1) {
        selector += `:nth-child(${Array.from(parent.children).indexOf(current) + 1})`;
      }
    }

    parts.push(selector);
    current = current.parentElement;
  }

  return parts.reverse().join(' > ');
}

function createPickerUI() {
  pickerOverlay = document.createElement('div');
  pickerOverlay.id = '__autoclick_picker_overlay';
  pickerOverlay.style.cssText = `
    position: fixed; pointer-events: none; z-index: 2147483647;
    border: 2px solid #6c5ce7; background: rgba(108, 92, 231, 0.12);
    border-radius: 4px; transition: all 0.1s ease; display: none;
    box-shadow: 0 0 0 1px rgba(108, 92, 231, 0.3), 0 0 20px rgba(108, 92, 231, 0.15);
  `;

  pickerTooltip = document.createElement('div');
  pickerTooltip.id = '__autoclick_picker_tooltip';
  pickerTooltip.style.cssText = `
    position: fixed; z-index: 2147483647; pointer-events: none;
    background: #1a1a3a; color: #e8e8f0;
    font-family: 'Consolas', 'Courier New', monospace; font-size: 12px;
    padding: 6px 10px; border-radius: 6px;
    border: 1px solid rgba(108, 92, 231, 0.4);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    max-width: 400px; white-space: nowrap; overflow: hidden;
    text-overflow: ellipsis; display: none;
  `;

  const banner = document.createElement('div');
  banner.id = '__autoclick_picker_banner';
  banner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
    background: linear-gradient(135deg, #6c5ce7, #a29bfe);
    color: white; text-align: center; padding: 8px 16px;
    font-family: -apple-system, 'Segoe UI', sans-serif;
    font-size: 13px; font-weight: 600;
    box-shadow: 0 2px 12px rgba(108, 92, 231, 0.4);
    display: flex; align-items: center; justify-content: center; gap: 8px;
  `;
  banner.innerHTML = `🎯 <span>Element Picker Active</span> — <span style="opacity:0.8;font-weight:400">Click an element to select it · Press <kbd style="background:rgba(0,0,0,0.2);padding:2px 6px;border-radius:3px;font-size:11px">ESC</kbd> to cancel</span>`;

  document.documentElement.appendChild(pickerOverlay);
  document.documentElement.appendChild(pickerTooltip);
  document.documentElement.appendChild(banner);
}

function destroyPickerUI() {
  document.getElementById('__autoclick_picker_overlay')?.remove();
  document.getElementById('__autoclick_picker_tooltip')?.remove();
  document.getElementById('__autoclick_picker_banner')?.remove();
  pickerOverlay = null;
  pickerTooltip = null;
  currentHovered = null;
}

function onPickerMouseMove(e) {
  if (!pickerActive) return;
  const el = e.target;
  if (el.id?.startsWith('__autoclick_picker')) return;

  currentHovered = el;
  const rect = el.getBoundingClientRect();

  if (pickerOverlay) {
    pickerOverlay.style.display = 'block';
    pickerOverlay.style.top = rect.top + 'px';
    pickerOverlay.style.left = rect.left + 'px';
    pickerOverlay.style.width = rect.width + 'px';
    pickerOverlay.style.height = rect.height + 'px';
  }

  if (pickerTooltip) {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const classes = el.classList.length
      ? '.' + Array.from(el.classList).slice(0, 3).join('.')
      : '';
    const text = el.textContent?.trim().substring(0, 40) || '';
    const textPreview = text ? ` — "${text}${(el.textContent?.trim().length || 0) > 40 ? '…' : ''}"` : '';

    pickerTooltip.textContent = `${tag}${id}${classes}${textPreview}`;
    pickerTooltip.style.display = 'block';

    let tooltipTop = rect.bottom + 8;
    if (tooltipTop + 30 > window.innerHeight) {
      tooltipTop = rect.top - 36;
    }
    pickerTooltip.style.top = tooltipTop + 'px';
    pickerTooltip.style.left = Math.min(rect.left, window.innerWidth - 410) + 'px';
  }
}

function onPickerClick(e) {
  if (!pickerActive) return;
  if (e.target.id?.startsWith('__autoclick_picker')) return;

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  const el = e.target;
  const selector = generateSelector(el);
  const tag = el.tagName.toLowerCase();
  const text = el.textContent?.trim().substring(0, 60) || '';

  stopPicker();

  chrome.runtime.sendMessage({
    type: 'picker-result',
    selector,
    tag,
    text,
    id: el.id || null,
    classes: Array.from(el.classList),
  });
}

function onPickerKeyDown(e) {
  if (e.key === 'Escape' && pickerActive) {
    e.preventDefault();
    stopPicker();
    chrome.runtime.sendMessage({ type: 'picker-cancelled' });
  }
}

function startPicker() {
  if (pickerActive) return;
  pickerActive = true;
  createPickerUI();
  document.addEventListener('mousemove', onPickerMouseMove, true);
  document.addEventListener('click', onPickerClick, true);
  document.addEventListener('keydown', onPickerKeyDown, true);
  document.body.style.cursor = 'crosshair';
}

function stopPicker() {
  pickerActive = false;
  document.removeEventListener('mousemove', onPickerMouseMove, true);
  document.removeEventListener('click', onPickerClick, true);
  document.removeEventListener('keydown', onPickerKeyDown, true);
  document.body.style.cursor = '';
  destroyPickerUI();
}

// ─── Message Listener ───────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Wrap all handling in async IIFE so we always use return true pattern
  (async () => {
    try {
      if (msg.type === 'execute') {
        const action = msg.action;
        const handler = handlers[action.type];

        if (!handler) {
          sendResponse({ success: false, action: action.type, error: `Unknown action: ${action.type}` });
          return;
        }

        const result = handler(action);

        // Handle async handlers (wait returns Promise)
        if (result instanceof Promise) {
          const asyncResult = await result;
          sendResponse(asyncResult);
        } else {
          sendResponse(result);
        }
        return;
      }

      if (msg.type === 'start-picker') {
        startPicker();
        sendResponse({ ok: true });
        return;
      }

      if (msg.type === 'stop-picker') {
        stopPicker();
        sendResponse({ ok: true });
        return;
      }

      if (msg.type === 'ping') {
        sendResponse({ pong: true });
        return;
      }
    } catch (err) {
      console.error('[AutoClick] Handler error:', err);
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true; // Always keep channel open for async
});

// ─── Announce Ready ─────────────────────────────────
console.log('[AutoClick] Content script loaded on', window.location.href);

} // end of guard
