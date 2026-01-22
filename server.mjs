import dotenv from 'dotenv';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import webpush from 'web-push';

import { getCollections } from './database/db.js';

dotenv.config();

const app = express();

const {
  PORT = 3000,
  LOG_FORMAT = 'dev',
  RATE_LIMIT_WINDOW_MS = '60000',
  RATE_LIMIT_MAX = '100',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT = 'mailto:example@example.com',
  NODE_ENV = 'development',
} = process.env;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  throw new Error('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required in the environment.');
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Cache VAPID key to avoid repeated access
const CACHED_VAPID_KEY = VAPID_PUBLIC_KEY;

app.set('trust proxy', 1);

// Manual CORS to fix "Provisional headers" issues if dev server restarts or browser is strict
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  next();
});

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  })
);

app.use(morgan(LOG_FORMAT));

const apiLimiter = rateLimit({
  windowMs: Number(RATE_LIMIT_WINDOW_MS),
  limit: Number(RATE_LIMIT_MAX),
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(['/subscribe', '/unsubscribe', '/send-notification', '/devices'], apiLimiter);

app.use(express.json({ limit: '1mb' }));

// Serve static files with caching
app.use(
  express.static('public', {
    maxAge: NODE_ENV === 'production' ? '1d' : 0,
    etag: true,
    lastModified: true,
  })
);

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/vapid-public-key', (req, res) => {
  res.json({ key: CACHED_VAPID_KEY });
});

app.post('/subscribe', async (req, res) => {
  const { deviceId, subscription, deviceName } = req.body || {};

  if (!deviceId || !subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'deviceId and valid subscription are required.' });
  }

  try {
    const { devices } = await getCollections();
    await devices.updateOne(
      { deviceId },
      {
        $set: {
          subscription,
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          deviceName: deviceName || req.headers['user-agent'] || 'Unknown device',
          lastSeen: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );

    return res.json({ ok: true });
  } catch (error) {
    console.error('/subscribe failed', error);
    return res.status(500).json({ error: 'Failed to store subscription.' });
  }
});

app.post('/unsubscribe', async (req, res) => {
  const { deviceId } = req.body || {};

  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId is required.' });
  }

  try {
    const { devices } = await getCollections();
    await devices.deleteOne({ deviceId });
    return res.json({ ok: true });
  } catch (error) {
    console.error('/unsubscribe failed', error);
    return res.status(500).json({ error: 'Failed to remove subscription.' });
  }
});

app.get('/devices', async (req, res) => {
  try {
    const { devices } = await getCollections();
    // Optimize: Use lean query and limit fields
    const results = await devices
      .find(
        {},
        {
          projection: {
            _id: 0,
            deviceId: 1,
            deviceName: 1,
            endpoint: 1,
            lastSeen: 1,
            createdAt: 1,
          },
        }
      )
      .sort({ lastSeen: -1 })
      .limit(100) // Prevent huge responses
      .toArray();

    return res.json({ devices: results, count: results.length });
  } catch (error) {
    console.error('/devices failed', error);
    return res.status(500).json({ error: 'Failed to fetch devices.' });
  }
});

app.post('/send-notification', async (req, res) => {
  const { deviceId, message } = req.body || {};

  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId is required.' });
  }

  if (!message) {
    return res.status(400).json({ error: 'message is required.' });
  }

  try {
    const { devices, messages } = await getCollections();

    const sender = await devices.findOne({ deviceId });
    if (!sender) {
      return res.status(403).json({ error: 'Sender is not subscribed.' });
    }

    const allDevices = await devices.find({}).toArray();

    const payload = JSON.stringify({
      title: 'PushFlow',
      body: message,
      data: { sender: deviceId || 'unknown' },
      tag: 'pushflow-message',
    });

    const sendResults = await Promise.all(
      allDevices.map(async (device) => {
        try {
          await webpush.sendNotification(device.subscription, payload);
          return { deviceId: device.deviceId, ok: true };
        } catch (error) {
          const isGone = error?.statusCode === 404 || error?.statusCode === 410;
          if (isGone) {
            await devices.deleteOne({ deviceId: device.deviceId });
            console.warn('Removed stale subscription', device.deviceId);
          } else {
            console.error('Notification failed', device.deviceId, error);
          }
          return { deviceId: device.deviceId, ok: false };
        }
      })
    );

    await messages.insertOne({
      deviceId: deviceId || 'unknown',
      message,
      createdAt: new Date(),
    });

    return res.json({ ok: true, sent: sendResults.filter((r) => r.ok).length });
  } catch (error) {
    console.error('/send-notification failed', error);
    return res.status(500).json({ error: 'Failed to send notifications.' });
  }
});

// Danger: Removes all subscriptions. No UI, invoke manually if needed.
app.post('/admin/unsubscribe-all', async (req, res) => {
  try {
    const { devices } = await getCollections();
    const result = await devices.deleteMany({});
    return res.json({ ok: true, removed: result.deletedCount || 0 });
  } catch (error) {
    console.error('/admin/unsubscribe-all failed', error);
    return res.status(500).json({ error: 'Failed to unsubscribe all devices.' });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  console.error('Unhandled error', error);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  try {
    await getCollections();
    app.listen(PORT, () => {
      console.warn(`PushFlow server listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server', error);
    process.exit(1);
  }
}

// Only start server if not in Vercel serverless environment
if (process.env.VERCEL !== '1') {
  start();
}

// Export for Vercel serverless functions
export default app;
