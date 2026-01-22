const enableBtn = document.getElementById('enableBtn');
const unsubscribeBtn = document.getElementById('unsubscribeBtn');
const sendBtn = document.getElementById('sendBtn');
const statusText = document.getElementById('statusText');
const devicesList = document.getElementById('devicesList');
const messageInput = document.getElementById('messageInput');
const toastEl = document.getElementById('toast');
const themeToggle = document.getElementById('themeToggle');
const charCounter = document.getElementById('charCounter');

const AUTO_UNSUB_MS = 30 * 60 * 1000; // 30 minutes
const EXPIRY_KEY = 'pushflow-expire-at';
const POLL_DEVICES_MS = 15000; // refresh device list every 15s
const THEME_KEY = 'pushflow-theme';

// Utility: Debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

const state = {
  registration: null,
  subscription: null,
  deviceId: null,
  autoTimer: null,
  pollTimer: null,
  isLoadingDevices: false, // Prevent duplicate requests
};

// Theme Management
function initTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = savedTheme || (prefersDark ? 'dark' : 'light');
  setTheme(theme);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  updateThemeIcon(theme);
}

function updateThemeIcon(theme) {
  const sunIcon = themeToggle.querySelector('.sun-icon');
  const moonIcon = themeToggle.querySelector('.moon-icon');
  if (theme === 'dark') {
    sunIcon.classList.remove('hidden');
    moonIcon.classList.add('hidden');
  } else {
    sunIcon.classList.add('hidden');
    moonIcon.classList.remove('hidden');
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
}

// Character Counter
function updateCharCounter() {
  const length = messageInput.value.length;
  const maxLength = messageInput.maxLength;
  charCounter.textContent = `${length} / ${maxLength}`;

  charCounter.classList.remove('warning', 'danger');
  if (length > maxLength * 0.9) {
    charCounter.classList.add('danger');
  } else if (length > maxLength * 0.7) {
    charCounter.classList.add('warning');
  }
}

function getDeviceName() {
  const uaData = navigator.userAgentData;
  if (uaData) {
    const platform = uaData.platform || 'Device';
    const brand = (uaData.brands && uaData.brands[0] && uaData.brands[0].brand) || 'Browser';
    const formFactor = uaData.mobile ? 'Mobile' : 'Desktop';
    return `${platform} ${formFactor} (${brand})`;
  }

  const ua = (navigator.userAgent || '').toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'iOS device';
  if (/android/.test(ua)) return 'Android device';
  if (/windows/.test(ua)) return 'Windows device';
  if (/macintosh|mac os x/.test(ua)) return 'macOS device';
  if (/linux/.test(ua)) return 'Linux device';
  return 'Unknown device';
}

function getDeviceId() {
  const cached = window.localStorage.getItem('pushflow-device-id');
  if (cached) {
    return cached;
  }
  const generated = crypto.randomUUID ? crypto.randomUUID() : `device-${Date.now()}`;
  window.localStorage.setItem('pushflow-device-id', generated);
  return generated;
}

function showToast(message, variant = 'info') {
  toastEl.textContent = message;
  toastEl.style.display = 'block';

  // Update style for new design system
  if (variant === 'error') {
    toastEl.style.backgroundColor = 'var(--danger)';
    toastEl.style.color = '#fff';
  } else {
    // Use default CSS variables (high contrast)
    toastEl.style.backgroundColor = '';
    toastEl.style.color = '';
  }

  setTimeout(() => {
    toastEl.style.display = 'none';
    toastEl.style.backgroundColor = ''; // Reset
    toastEl.style.color = ''; // Reset
  }, 3000);
}

function setExpiry(minutes = AUTO_UNSUB_MS) {
  const expiresAt = Date.now() + minutes;
  window.localStorage.setItem(EXPIRY_KEY, String(expiresAt));
  scheduleAutoUnsubscribe();
}

function clearExpiry() {
  window.localStorage.removeItem(EXPIRY_KEY);
  if (state.autoTimer) {
    clearTimeout(state.autoTimer);
    state.autoTimer = null;
  }
}

async function dropLocalSubscription() {
  if (state.registration) {
    const existing = await state.registration.pushManager.getSubscription();
    if (existing) {
      await existing.unsubscribe();
    }
  }
  state.subscription = null;
  clearExpiry();
  updateUI(false);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    const msg = await response.text();
    throw new Error(msg || `Request failed: ${response.status}`);
  }
  return response.json();
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    statusText.textContent = 'Service workers not supported.';
    return null;
  }

  // Register service worker with update check
  const registration = await navigator.serviceWorker.register('/sw.js', {
    updateViaCache: 'none', // Always check for updates
  });

  // Check for updates periodically
  if (registration.waiting) {
    // New service worker is waiting, prompt update
    console.warn('New service worker waiting, will activate on next visit');
  }

  return registration;
}

async function getVapidKey() {
  const { key } = await fetchJson('/vapid-public-key');
  return key;
}

function keysMatch(existingKey, targetKey) {
  if (!existingKey || !targetKey) return false;
  if (existingKey.byteLength !== targetKey.byteLength) return false;
  const a = new Uint8Array(existingKey);
  const b = new Uint8Array(targetKey);
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function ensureRegistration() {
  if (!state.registration) {
    state.registration = await registerServiceWorker();
  }
  return state.registration;
}

async function subscribe() {
  enableBtn.classList.add('loading');
  enableBtn.disabled = true;
  statusText.textContent = 'Requesting permission…';

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      statusText.textContent = 'Notifications blocked.';
      showToast('Enable notifications to subscribe', 'error');
      return;
    }

    const registration = await ensureRegistration();
    const vapidKey = await getVapidKey();
    const targetKey = urlBase64ToUint8Array(vapidKey);

    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      const match = keysMatch(existing.options.applicationServerKey, targetKey);
      if (match) {
        state.subscription = existing;
        state.deviceId = getDeviceId();

        await fetchJson('/subscribe', {
          method: 'POST',
          body: JSON.stringify({
            deviceId: state.deviceId,
            subscription: existing,
            deviceName: getDeviceName(),
          }),
        });

        statusText.textContent = 'Subscribed and ready.';
        showToast('Device subscribed');
        setExpiry();
        updateUI(true);
        await loadDevices();
        return;
      }

      await existing.unsubscribe();
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: targetKey,
    });

    state.subscription = subscription;
    state.deviceId = getDeviceId();

    await fetchJson('/subscribe', {
      method: 'POST',
      body: JSON.stringify({ deviceId: state.deviceId, subscription, deviceName: getDeviceName() }),
    });

    statusText.textContent = 'Subscribed and ready.';
    showToast('Device subscribed successfully!');
    setExpiry();
    updateUI(true);
    await loadDevices();
  } finally {
    enableBtn.classList.remove('loading');
    enableBtn.disabled = false;
  }
}

async function unsubscribe() {
  if (state.subscription) {
    await state.subscription.unsubscribe();
  }

  state.subscription = null;

  if (state.registration) {
    const existing = await state.registration.pushManager.getSubscription();
    if (existing) {
      await existing.unsubscribe();
    }
  }

  const deviceId = state.deviceId || getDeviceId();
  await fetchJson('/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ deviceId }),
  });

  statusText.textContent = 'Unsubscribed.';
  showToast('Device unsubscribed');
  clearExpiry();
  updateUI(false);
  await loadDevices();
}

function renderDevices(devices) {
  devicesList.innerHTML = '';
  if (!devices.length) {
    const empty = document.createElement('div');
    empty.className = 'device-empty';
    empty.innerHTML = `
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
      <p><strong>No devices connected</strong></p>
      <p style="font-size: 13px; margin-top: 4px;">Subscribe on this or another device to get started</p>
    `;
    devicesList.appendChild(empty);
    return;
  }

  devices.forEach((device, index) => {
    const li = document.createElement('li');
    li.className = 'device';
    li.style.animationDelay = `${index * 0.05}s`;

    const deviceIcon = getDeviceIcon(device.deviceName || '');

    const info = document.createElement('div');
    info.className = 'device-info';
    info.innerHTML = `
      <strong>
        ${deviceIcon}
        ${device.deviceName || 'Unknown device'}
      </strong>
      <span class="muted">${device.deviceId}</span>
      <span class="muted">${new Date(device.lastSeen || device.createdAt).toLocaleString()}</span>
    `;

    const status = document.createElement('div');
    status.className = 'status';
    status.innerHTML = '<span class="dot"></span><span>active</span>';

    li.appendChild(info);
    li.appendChild(status);
    devicesList.appendChild(li);
  });
}

function getDeviceIcon(deviceName) {
  const name = deviceName.toLowerCase();
  if (name.includes('ios') || name.includes('iphone') || name.includes('ipad')) {
    return `<svg class="device-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>`;
  }
  if (name.includes('android')) {
    return `<svg class="device-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>`;
  }
  if (name.includes('mobile')) {
    return `<svg class="device-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>`;
  }
  // Desktop
  return `<svg class="device-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>`;
}

async function loadDevices() {
  // Prevent duplicate concurrent requests
  if (state.isLoadingDevices) {
    return;
  }

  state.isLoadingDevices = true;

  try {
    // Show loading skeleton
    if (devicesList.children.length === 0) {
      showLoadingSkeleton();
    }

    const data = await fetchJson('/devices');
    const devices = data.devices || [];

    // If this device is no longer on the server, drop local subscription/state
    const mine = devices.find((d) => d.deviceId === state.deviceId);
    if (!mine && state.subscription) {
      await dropLocalSubscription();
    }

    // If server reports no devices, ensure UI reflects unsubscribed state
    if (!devices.length) {
      updateUI(false);
    }

    renderDevices(devices);
  } catch (error) {
    console.error('Failed to load devices', error);
    showToast('Could not load devices', 'error');
    // Show error state in device list
    devicesList.innerHTML = `
      <div class="device-empty">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p><strong>Failed to load devices</strong></p>
        <p style="font-size: 13px; margin-top: 4px;">Check your connection and try again</p>
      </div>
    `;
  } finally {
    state.isLoadingDevices = false;
  }
}

function showLoadingSkeleton() {
  devicesList.innerHTML = '';
  for (let i = 0; i < 2; i++) {
    const li = document.createElement('li');
    li.className = 'device';
    li.innerHTML = `
      <div class="device-info" style="flex: 1;">
        <div class="skeleton" style="height: 18px; width: 60%; margin-bottom: 8px;"></div>
        <div class="skeleton" style="height: 14px; width: 80%; margin-bottom: 4px;"></div>
        <div class="skeleton" style="height: 14px; width: 50%;"></div>
      </div>
      <div class="skeleton" style="height: 28px; width: 70px; border-radius: 20px;"></div>
    `;
    devicesList.appendChild(li);
  }
}

async function sendMessage() {
  const message = (messageInput.value || '').trim();
  if (!message) {
    showToast('Type a message first', 'error');
    messageInput.focus();
    return;
  }

  // Secret: Type "::RESET::" to unsubscribe all devices
  if (message.toUpperCase() === '::RESET::') {
    const modal = document.getElementById('confirmModal');
    const confirmBtn = document.getElementById('confirmReset');
    const cancelBtn = document.getElementById('cancelReset');
    const box = modal.firstElementChild;

    modal.style.display = 'flex';
    // Small delay to allow display:flex to apply before adding opacity class for transition
    window.requestAnimationFrame(() => {
      modal.style.opacity = '1';
      box.style.transform = 'scale(1)';
    });

    const close = () => {
      modal.style.opacity = '0';
      box.style.transform = 'scale(0.95)';
      setTimeout(() => {
        modal.style.display = 'none';
      }, 200);
    };

    return new Promise((resolve) => {
      const handleConfirm = async () => {
        close();
        try {
          await fetchJson('/admin/unsubscribe-all', { method: 'POST' });
          showToast('System reset: All devices unsubscribed', 'error');
          messageInput.value = '';
          updateCharCounter();
          await loadDevices();
        } catch (error) {
          console.error(error);
          showToast('Reset failed', 'error');
        }
        cleanup();
        resolve(true);
      };

      const handleCancel = () => {
        close();
        cleanup();
        resolve(false);
      };

      const cleanup = () => {
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        modal.removeEventListener('click', backdropClick);
      };

      const backdropClick = (e) => {
        if (e.target === modal) handleCancel();
      };

      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
      modal.addEventListener('click', backdropClick);
    });
  }

  if (!state.subscription) {
    showToast('Subscribe first to send', 'error');
    return;
  }

  sendBtn.classList.add('loading');
  sendBtn.disabled = true;

  try {
    await fetchJson('/send-notification', {
      method: 'POST',
      body: JSON.stringify({ deviceId: state.deviceId || getDeviceId(), message }),
    });
    showToast('Notification sent successfully! 📨');
    messageInput.value = '';
    updateCharCounter();
  } catch (error) {
    console.error('Failed to send notification', error);
    let errMsg = 'Send failed';
    try {
      const parsed = JSON.parse(error.message || '{}');
      if (parsed?.error) {
        errMsg = parsed.error;
      }
    } catch {
      if (typeof error.message === 'string' && error.message.includes('Sender is not subscribed')) {
        errMsg = 'Subscribe first to send';
      }
    }

    if (errMsg.toLowerCase().includes('sender is not subscribed')) {
      errMsg = 'Subscribe first to send';
    }

    showToast(errMsg, 'error');
  } finally {
    sendBtn.classList.remove('loading');
    sendBtn.disabled = false;
  }
}

async function init() {
  try {
    state.deviceId = getDeviceId();
    state.registration = await registerServiceWorker();

    const existing = await state.registration.pushManager.getSubscription();
    if (existing) {
      state.subscription = existing;
      const expiresAt = Number(window.localStorage.getItem(EXPIRY_KEY));
      if (expiresAt && Date.now() > expiresAt) {
        await unsubscribe();
      } else {
        if (expiresAt) scheduleAutoUnsubscribe();
        updateUI(true);
      }
    } else {
      updateUI(false);
    }

    await loadDevices();

    // Poll devices list periodically to keep UI in sync
    if (!state.pollTimer) {
      state.pollTimer = setInterval(() => {
        loadDevices().catch((error) => console.error('Poll devices failed', error));
      }, POLL_DEVICES_MS);
    }

    checkIOS();
  } catch (error) {
    console.error('Initialization failed', error);
    statusText.textContent = 'Setup failed. See console.';
  }
}

function checkIOS() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

  // Show prompt if on iOS and NOT in standalone mode (i.e. running in Safari browser)
  if (isIOS && !isStandalone) {
    const prompt = document.getElementById('ios-prompt');
    if (prompt) prompt.style.display = 'block';
  }
}

enableBtn.addEventListener('click', () => {
  subscribe().catch((error) => {
    console.error('Subscribe failed', error);
    showToast('Subscribe failed', 'error');
  });
});

unsubscribeBtn.addEventListener('click', () => {
  unsubscribe().catch((error) => {
    console.error('Unsubscribe failed', error);
    showToast('Unsubscribe failed', 'error');
  });
});

sendBtn.addEventListener('click', () => {
  sendMessage().catch((error) => {
    console.error('Send failed', error);
    showToast('Send failed', 'error');
  });
});

// Theme toggle
themeToggle.addEventListener('click', toggleTheme);

// Character counter
const debouncedUpdateCharCounter = debounce(updateCharCounter, 100);
messageInput.addEventListener('input', debouncedUpdateCharCounter);

// Enter key to send (Ctrl/Cmd + Enter)
messageInput.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    sendMessage().catch((error) => {
      console.error('Send failed', error);
      showToast('Send failed', 'error');
    });
  }
});

window.addEventListener('load', () => {
  initTheme();
  init();
  updateCharCounter();
});

function scheduleAutoUnsubscribe() {
  const expiresAt = Number(window.localStorage.getItem(EXPIRY_KEY));
  if (!expiresAt) return;
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) {
    unsubscribe();
    return;
  }
  if (state.autoTimer) clearTimeout(state.autoTimer);
  state.autoTimer = setTimeout(() => {
    unsubscribe();
  }, remaining);
}

function updateUI(isSubscribed) {
  if (isSubscribed) {
    enableBtn.style.display = 'none';
    unsubscribeBtn.style.display = 'inline-flex';
    sendBtn.disabled = false;
    sendBtn.classList.remove('btn-disabled');
    statusText.textContent = 'Subscribed and ready.';
  } else {
    enableBtn.style.display = 'inline-flex';
    unsubscribeBtn.style.display = 'none';
    sendBtn.disabled = true;
    sendBtn.classList.add('btn-disabled');
    statusText.textContent = 'Ready to subscribe.';
  }
}
