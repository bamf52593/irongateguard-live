const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:404/v1';
const inMemoryKeys = new Set();

function canUseSessionStorage() {
  try {
    return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function trackEvent(eventName, details = {}, options = {}) {
  if (!eventName || typeof window === 'undefined') {
    return;
  }

  const onceKey = options.onceKey || '';
  if (onceKey) {
    const storageKey = `analytics:${onceKey}`;

    if (inMemoryKeys.has(storageKey)) {
      return;
    }

    if (canUseSessionStorage() && window.sessionStorage.getItem(storageKey)) {
      return;
    }

    inMemoryKeys.add(storageKey);
    if (canUseSessionStorage()) {
      window.sessionStorage.setItem(storageKey, '1');
    }
  }

  const payload = JSON.stringify({
    eventName,
    path: window.location.pathname,
    source: details.source || 'web_app',
    details
  });

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(`${API_URL}/public/track`, blob);
      return;
    }
  } catch {
    // Fall through to fetch-based tracking.
  }

  fetch(`${API_URL}/public/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true
  }).catch(() => {
    // Analytics should never block the product flow.
  });
}
