// ─── Auto Click UI — Content Script ─────────────────
// Executes DOM actions (click, type, read, wait) on
// the current page, dispatched by the background worker.

// ─── Action Handlers ────────────────────────────────
const handlers = {
  /**
   * Click an element by CSS selector
   */
  click: (action) => {
    const el = document.querySelector(action.selector);
    if (!el) {
      return { success: false, action: 'click', error: `Element not found: ${action.selector}` };
    }

    // Scroll into view first
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Dispatch real click events
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    return { success: true, action: 'click', data: action.selector };
  },

  /**
   * Type text into an input/textarea
   */
  type: (action) => {
    const el = document.querySelector(action.selector);
    if (!el) {
      return { success: false, action: 'type', error: `Element not found: ${action.selector}` };
    }

    // Focus the element
    el.focus();

    // Clear existing value
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));

    // Set new value
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set || Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, action.value);
    } else {
      el.value = action.value;
    }

    // Trigger events that frameworks listen to
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

    return { success: true, action: 'type', data: `Typed "${action.value}" → ${action.selector}` };
  },

  /**
   * Read textContent of elements matching a selector
   */
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

  /**
   * Wait for an element to appear in the DOM
   */
  wait: (action) => {
    return new Promise((resolve) => {
      const timeout = action.timeout || 5000;
      const startTime = Date.now();

      // Check immediately
      if (document.querySelector(action.selector)) {
        resolve({ success: true, action: 'wait', data: `Found: ${action.selector}` });
        return;
      }

      // Observe DOM changes
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

      // Timeout
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

// ─── Message Listener ───────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'execute') return;

  const action = msg.action;
  const handler = handlers[action.type];

  if (!handler) {
    sendResponse({ success: false, action: action.type, error: `Unknown action: ${action.type}` });
    return;
  }

  const result = handler(action);

  // Handle async (wait action returns a Promise)
  if (result instanceof Promise) {
    result.then(sendResponse);
    return true; // Keep message channel open for async
  }

  sendResponse(result);
});

// ─── Announce Ready ─────────────────────────────────
console.log('[AutoClick] Content script loaded on', window.location.href);
