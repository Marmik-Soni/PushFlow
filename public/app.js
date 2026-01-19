const enableBtn = document.getElementById('enableBtn');
const unsubscribeBtn = document.getElementById('unsubscribeBtn');
const sendBtn = document.getElementById('sendBtn');
const statusText = document.getElementById('statusText');
const devicesList = document.getElementById('devicesList');
const messageInput = document.getElementById('messageInput');
const toastEl = document.getElementById('toast');

const AUTO_UNSUB_MS = 30 * 60 * 1000; // 30 minutes
const EXPIRY_KEY = 'pushflow-expire-at';
const POLL_DEVICES_MS = 15000; // refresh device list every 15s

const state = {
  registration: null,
  subscription: null,
  deviceId: null,
  autoTimer: null,
  pollTimer: null,
};

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
  toastEl.style.borderColor = variant === 'error' ? '#f87171' : '#22d3ee';
  setTimeout(() => {
    toastEl.style.display = 'none';
  }, 2400);
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
  const registration = await navigator.serviceWorker.register('/sw.js');
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
  statusText.textContent = 'Requesting permission…';
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
  showToast('Device subscribed');
  setExpiry();
  updateUI(true);
  await loadDevices();
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
    const empty = document.createElement('li');
    empty.className = 'device';
    empty.textContent = 'No devices yet.';
    devicesList.appendChild(empty);
    return;
  }

  devices.forEach((device) => {
    const li = document.createElement('li');
    li.className = 'device';
    const info = document.createElement('div');
    info.innerHTML = `<strong>${device.deviceName || 'Unknown device'}</strong><br><span class="muted">${
      device.deviceId
    }</span><br><span class="muted">${new Date(device.lastSeen || device.createdAt).toLocaleString()}</span>`;
    const status = document.createElement('div');
    status.className = 'status';
    status.innerHTML = '<span class="dot"></span><span>active</span>';
    li.appendChild(info);
    li.appendChild(status);
    devicesList.appendChild(li);
  });
}

async function loadDevices() {
  try {
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
  }
}

async function sendMessage() {
  const message = (messageInput.value || '').trim();
  if (!message) {
    showToast('Type a message first', 'error');
    return;
  }
  if (!state.subscription) {
    showToast('Subscribe first to send', 'error');
    return;
  }
  try {
    await fetchJson('/send-notification', {
      method: 'POST',
      body: JSON.stringify({ deviceId: state.deviceId || getDeviceId(), message }),
    });
    showToast('Notification sent');
    messageInput.value = '';
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
  } catch (error) {
    console.error('Initialization failed', error);
    statusText.textContent = 'Setup failed. See console.';
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

window.addEventListener('load', init);

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
