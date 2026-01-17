const enableBtn = document.getElementById('enableBtn');
const unsubscribeBtn = document.getElementById('unsubscribeBtn');
const sendBtn = document.getElementById('sendBtn');
const statusText = document.getElementById('statusText');
const devicesList = document.getElementById('devicesList');
const messageInput = document.getElementById('messageInput');
const toastEl = document.getElementById('toast');

const state = {
  registration: null,
  subscription: null,
  deviceId: null,
};

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
        body: JSON.stringify({ deviceId: state.deviceId, subscription: existing }),
      });

      statusText.textContent = 'Subscribed and ready.';
      showToast('Device subscribed');
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
    body: JSON.stringify({ deviceId: state.deviceId, subscription }),
  });

  statusText.textContent = 'Subscribed and ready.';
  showToast('Device subscribed');
  await loadDevices();
}

async function unsubscribe() {
  if (state.subscription) {
    await state.subscription.unsubscribe();
  }

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
    info.innerHTML = `<strong>${device.deviceId}</strong><br><span class="muted">${new Date(
      device.lastSeen || device.createdAt
    ).toLocaleString()}</span>`;
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
    renderDevices(data.devices || []);
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
  try {
    await fetchJson('/send-notification', {
      method: 'POST',
      body: JSON.stringify({ deviceId: state.deviceId || getDeviceId(), message }),
    });
    showToast('Notification sent');
    messageInput.value = '';
  } catch (error) {
    console.error('Failed to send notification', error);
    showToast('Send failed', 'error');
  }
}

async function init() {
  try {
    state.deviceId = getDeviceId();
    state.registration = await registerServiceWorker();
    statusText.textContent = 'Ready to subscribe.';
    await loadDevices();
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
