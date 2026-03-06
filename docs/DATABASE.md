# Database Documentation

## What is the Database Layer?

The database layer in PushFlow is the persistent storage system built on MongoDB, a NoSQL document database that stores all subscription information and message history. Unlike traditional relational databases, MongoDB stores data as flexible JSON-like documents, making it ideal for storing the complex nested structure of push subscriptions (endpoint URLs, encryption keys, device metadata). This layer handles critical operations like storing device subscriptions when users enable notifications, retrieving all active devices when broadcasting messages, and automatically managing indexes for optimal query performance. MongoDB's connection pooling ensures efficient resource usage, while its atomic operations guarantee data consistency even under high concurrent load. The database layer abstracts away the complexity of data management, providing a clean interface for the application server to store and retrieve subscription data without worrying about the underlying implementation details.

---

## Table of Contents

1. [MongoDB Setup](#mongodb-setup)
2. [Database Schema](#database-schema)
3. [Collections Overview](#collections-overview)
4. [Indexes & Performance](#indexes--performance)
5. [Connection Management](#connection-management)
6. [Common Queries](#common-queries)
7. [Data Validation](#data-validation)
8. [Optimization Techniques](#optimization-techniques)
9. [Backup & Recovery](#backup--recovery)

---

## MongoDB Setup

### MongoDB Atlas (Cloud - Recommended)

**1. Create Cluster**:

- Sign up at [https://cloud.mongodb.com](https://cloud.mongodb.com)
- Create a free M0 cluster (512 MB storage)
- Choose a region close to your server

**2. Configure Network Access**:

- Add IP address: `0.0.0.0/0` (allow all) for development
- Or whitelist specific IPs for production

**3. Create Database User**:

- Username: `pushflow-admin`
- Password: Generate secure password
- Permissions: Read and write to any database

**4. Get Connection String**:

```
mongodb+srv://pushflow-admin:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

**5. Environment Configuration** (`.env`):

```env
MONGODB_URI=mongodb+srv://pushflow-admin:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=pushflow
```

### Local MongoDB (Development)

**Installation**:

```bash
# macOS (Homebrew)
brew tap mongodb/brew
brew install mongodb-community

# Ubuntu
sudo apt-get install mongodb

# Windows
# Download installer from mongodb.com
```

**Start Server**:

```bash
# macOS/Linux
mongod --dbpath /usr/local/var/mongodb

# Windows
mongod --dbpath C:\data\db
```

**Connection String**:

```env
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=pushflow
```

---

## Database Schema

PushFlow uses two main collections: `devices` and `messages`.

### Schema Design Philosophy

**Document-Oriented Design**:

- Store complete subscription object in each device document
- Embed related data (keys, endpoint) rather than referencing
- Optimize for read-heavy workload (devices read frequently when sending)

**No Schema Enforcement** (MongoDB flexible schema):

- Schema defined by application code, not database
- Allows for easy evolution as requirements change
- Use validation at application layer

---

## Collections Overview

### 1. Devices Collection

Stores push notification subscriptions for each device.

**Collection Name**: `devices`

**Document Structure**:

```javascript
{
  _id: ObjectId("65b9f8a0123456789abcdef0"),
  deviceId: "550e8400-e29b-41d4-a716-446655440000",
  deviceName: "Windows Desktop (Chrome)",
  subscription: {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc123...",
    expirationTime: null,
    keys: {
      p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM=",
      auth: "tBHItJI5svbpez7KI4CCXg=="
    }
  },
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123...",
  keys: {
    p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM=",
    auth: "tBHItJI5svbpez7KI4CCXg=="
  },
  createdAt: ISODate("2026-01-30T10:00:00.000Z"),
  lastSeen: ISODate("2026-01-30T15:30:00.000Z")
}
```

**Field Descriptions**:

| Field                      | Type     | Description                               |
| -------------------------- | -------- | ----------------------------------------- |
| `_id`                      | ObjectId | MongoDB auto-generated unique identifier  |
| `deviceId`                 | String   | Client-generated UUID (unique per device) |
| `deviceName`               | String   | Human-readable device name                |
| `subscription`             | Object   | Full PushSubscription object from browser |
| `subscription.endpoint`    | String   | Push service URL                          |
| `subscription.keys.p256dh` | String   | Public key for encryption (Base64)        |
| `subscription.keys.auth`   | String   | Auth secret (Base64)                      |
| `endpoint`                 | String   | Denormalized endpoint for quick access    |
| `keys`                     | Object   | Denormalized keys for quick access        |
| `createdAt`                | Date     | When device was first subscribed          |
| `lastSeen`                 | Date     | Last time device subscription was updated |

**Why Denormalize?**

```javascript
// Denormalized structure allows faster access
await devices.findOne({ endpoint: 'https://fcm.googleapis.com/...' });

// Instead of nested query
await devices.findOne({ 'subscription.endpoint': 'https://fcm.googleapis.com/...' });
```

### 2. Messages Collection

Stores message history for analytics and debugging.

**Collection Name**: `messages`

**Document Structure**:

```javascript
{
  _id: ObjectId("65b9f8a0123456789abcdef1"),
  deviceId: "550e8400-e29b-41d4-a716-446655440000",
  message: "Hello from my desktop!",
  createdAt: ISODate("2026-01-30T15:30:45.123Z")
}
```

**Field Descriptions**:

| Field       | Type     | Description                              |
| ----------- | -------- | ---------------------------------------- |
| `_id`       | ObjectId | MongoDB auto-generated unique identifier |
| `deviceId`  | String   | ID of device that sent the message       |
| `message`   | String   | Message content (max 500 characters)     |
| `createdAt` | Date     | When message was sent                    |

---

## Indexes & Performance

### Why Indexes?

Indexes dramatically improve query performance by allowing MongoDB to quickly locate documents without scanning the entire collection.

```
Without Index: O(n) - Scans all documents
With Index:    O(log n) - Binary search on index
```

### Index Creation

**Location**: `database/db.js`

```javascript
async function getCollections() {
  const db = await getDb();
  const devices = db.collection('devices');
  const messages = db.collection('messages');

  // Ensure indexes once per process
  if (!indexesEnsured) {
    // Devices collection indexes
    await devices.createIndex(
      { deviceId: 1 },
      { unique: true } // Prevent duplicate devices
    );
    await devices.createIndex({ lastSeen: -1 }); // Sort by recent
    await devices.createIndex({ createdAt: -1 }); // Sort by creation

    // Messages collection indexes
    await messages.createIndex({ createdAt: -1 }); // Recent messages
    await messages.createIndex({ deviceId: 1 }); // Filter by device

    indexesEnsured = true;
  }

  return { devices, messages };
}
```

### Index Types

**1. Single Field Index**:

```javascript
// Index on deviceId field (ascending)
await devices.createIndex({ deviceId: 1 });

// Usage: Fast lookup by deviceId
await devices.findOne({ deviceId: 'abc-123' });
```

**2. Unique Index**:

```javascript
// Enforce uniqueness on deviceId
await devices.createIndex({ deviceId: 1 }, { unique: true });

// Prevents duplicate inserts
// Error: E11000 duplicate key error
```

**3. Compound Index**:

```javascript
// Index on multiple fields
await messages.createIndex({
  deviceId: 1,
  createdAt: -1,
});

// Usage: Filter by device and sort by date
await messages.find({ deviceId: 'abc-123' }).sort({ createdAt: -1 }).toArray();
```

**4. TTL Index (Time-To-Live)**:

```javascript
// Automatically delete old messages after 30 days
await messages.createIndex({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
```

### Index Performance Monitoring

**Check index usage**:

```javascript
// Get index stats
const stats = await devices.stats();
console.log('Indexes:', stats.indexes);

// Explain query plan
const explainResult = await devices.find({ deviceId: 'abc-123' }).explain('executionStats');

console.log('Execution stats:', explainResult.executionStats);
```

**Key Metrics**:

- `totalDocsExamined`: Number of documents scanned
- `totalKeysExamined`: Number of index entries scanned
- `executionTimeMillis`: Query execution time

**Good Performance**: `totalDocsExamined` ≈ `totalKeysExamined` ≈ results count

---

## Connection Management

### Connection Pooling

**Location**: `database/db.js`

```javascript
import { MongoClient } from 'mongodb';

let client;
let indexesEnsured = false;

async function getClient() {
  if (!client) {
    client = new MongoClient(MONGODB_URI, {
      appName: 'pushflow',
      retryWrites: true, // Retry failed writes
      maxPoolSize: 10, // Max connections in pool
      minPoolSize: 2, // Min connections in pool
      maxIdleTimeMS: 30000, // Close idle connections after 30s
      serverSelectionTimeoutMS: 5000, // Timeout for finding server
    });
    await client.connect();
    console.log('Connected to MongoDB');
  }
  return client;
}

async function getDb() {
  const activeClient = await getClient();
  return activeClient.db(MONGODB_DB_NAME);
}
```

**Connection Pool Benefits**:

1. **Reuse**: Don't create new connection for each request
2. **Performance**: Connection creation is expensive (~100ms)
3. **Scalability**: Limit max connections to avoid overwhelming database

### Error Handling

```javascript
async function getCollections() {
  try {
    const db = await getDb();
    const devices = db.collection('devices');
    const messages = db.collection('messages');

    // Ensure indexes...

    return { devices, messages };
  } catch (error) {
    console.error('Failed to get collections:', error);
    throw new Error('Database connection failed');
  }
}
```

### Graceful Shutdown

```javascript
// Close connection on app shutdown
process.on('SIGINT', async () => {
  if (client) {
    await client.close();
    console.log('MongoDB connection closed');
  }
  process.exit(0);
});
```

---

## Common Queries

### Devices Collection Queries

**1. Insert or Update Device (Upsert)**:

```javascript
await devices.updateOne(
  { deviceId }, // Filter
  {
    $set: {
      subscription,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      deviceName: deviceName || 'Unknown device',
      lastSeen: new Date(),
    },
    $setOnInsert: {
      createdAt: new Date(), // Only set on insert
    },
  },
  { upsert: true } // Insert if not exists
);
```

**2. Find Device by ID**:

```javascript
const device = await devices.findOne({ deviceId: 'abc-123' });

if (!device) {
  console.log('Device not found');
}
```

**3. Get All Active Devices**:

```javascript
const allDevices = await devices
  .find({})
  .sort({ lastSeen: -1 }) // Most recent first
  .toArray();

console.log(`Found ${allDevices.length} devices`);
```

**4. Get Devices with Projection** (only specific fields):

```javascript
const deviceList = await devices
  .find(
    {},
    {
      projection: {
        _id: 0, // Exclude _id
        deviceId: 1, // Include deviceId
        deviceName: 1, // Include deviceName
        endpoint: 1, // Include endpoint
        lastSeen: 1, // Include lastSeen
      },
    }
  )
  .limit(100) // Limit results
  .toArray();
```

**Benefits of Projection**:

- Reduces network bandwidth
- Faster query execution
- Smaller memory footprint

**5. Delete Device**:

```javascript
const result = await devices.deleteOne({ deviceId: 'abc-123' });

if (result.deletedCount === 0) {
  console.log('Device not found');
} else {
  console.log('Device deleted');
}
```

**6. Delete Stale Devices** (inactive for 30+ days):

```javascript
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

const result = await devices.deleteMany({
  lastSeen: { $lt: thirtyDaysAgo },
});

console.log(`Deleted ${result.deletedCount} stale devices`);
```

**7. Count Active Devices**:

```javascript
const count = await devices.countDocuments({});
console.log(`Active devices: ${count}`);

// Count with filter
const recentCount = await devices.countDocuments({
  lastSeen: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
});
console.log(`Active in last 24h: ${recentCount}`);
```

### Messages Collection Queries

**1. Insert Message**:

```javascript
await messages.insertOne({
  deviceId: 'abc-123',
  message: 'Hello world',
  createdAt: new Date(),
});
```

**2. Get Recent Messages**:

```javascript
const recentMessages = await messages
  .find({})
  .sort({ createdAt: -1 }) // Newest first
  .limit(50) // Last 50 messages
  .toArray();
```

**3. Get Messages by Device**:

```javascript
const deviceMessages = await messages
  .find({ deviceId: 'abc-123' })
  .sort({ createdAt: -1 })
  .toArray();
```

**4. Delete Old Messages** (older than 30 days):

```javascript
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

const result = await messages.deleteMany({
  createdAt: { $lt: thirtyDaysAgo },
});

console.log(`Deleted ${result.deletedCount} old messages`);
```

**5. Aggregate Message Stats**:

```javascript
const stats = await messages
  .aggregate([
    {
      $group: {
        _id: '$deviceId',
        messageCount: { $sum: 1 },
        lastMessage: { $max: '$createdAt' },
      },
    },
    { $sort: { messageCount: -1 } },
    { $limit: 10 },
  ])
  .toArray();

console.log('Top 10 senders:', stats);
```

---

## Data Validation

### Application-Level Validation

**Location**: `server.mjs`

```javascript
function validateSubscription(subscription) {
  if (!subscription || typeof subscription !== 'object') {
    return { valid: false, error: 'Subscription must be an object' };
  }

  if (!subscription.endpoint || typeof subscription.endpoint !== 'string') {
    return { valid: false, error: 'Invalid endpoint' };
  }

  if (!subscription.keys || typeof subscription.keys !== 'object') {
    return { valid: false, error: 'Missing keys' };
  }

  if (!subscription.keys.p256dh || !subscription.keys.auth) {
    return { valid: false, error: 'Invalid keys format' };
  }

  return { valid: true };
}

// Usage in API
app.post('/subscribe', async (req, res) => {
  const { deviceId, subscription } = req.body;

  const validation = validateSubscription(subscription);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  // Continue with subscription...
});
```

### MongoDB Schema Validation (Optional)

```javascript
// Create collection with validation rules
await db.createCollection('devices', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['deviceId', 'subscription', 'createdAt'],
      properties: {
        deviceId: {
          bsonType: 'string',
          description: 'Required string',
        },
        subscription: {
          bsonType: 'object',
          required: ['endpoint', 'keys'],
          properties: {
            endpoint: { bsonType: 'string' },
            keys: {
              bsonType: 'object',
              required: ['p256dh', 'auth'],
            },
          },
        },
        createdAt: {
          bsonType: 'date',
        },
      },
    },
  },
});
```

---

## Optimization Techniques

### 1. Use Projections

**❌ Bad** (loads entire document):

```javascript
const devices = await devices.find({}).toArray();
```

**✅ Good** (loads only needed fields):

```javascript
const devices = await devices
  .find(
    {},
    {
      projection: {
        deviceId: 1,
        deviceName: 1,
        lastSeen: 1,
      },
    }
  )
  .toArray();
```

**Savings**: 50-80% reduction in data transfer

### 2. Limit Query Results

```javascript
// Always limit large queries
const devices = await devices
  .find({})
  .limit(100) // Max 100 devices
  .toArray();
```

### 3. Use Indexes for Sorting

**❌ Bad** (in-memory sort):

```javascript
// No index on lastSeen
await devices.find({}).sort({ lastSeen: -1 });
```

**✅ Good** (index sort):

```javascript
// Index exists on lastSeen
await devices.createIndex({ lastSeen: -1 });
await devices.find({}).sort({ lastSeen: -1 });
```

### 4. Batch Operations

**❌ Bad** (one at a time):

```javascript
for (const device of devices) {
  await devices.deleteOne({ deviceId: device.deviceId });
}
```

**✅ Good** (batch delete):

```javascript
const deviceIds = devices.map((d) => d.deviceId);
await devices.deleteMany({
  deviceId: { $in: deviceIds },
});
```

### 5. Connection Pooling

```javascript
// Reuse single client instance
let client;

async function getClient() {
  if (!client) {
    client = new MongoClient(MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
    });
    await client.connect();
  }
  return client;
}
```

### 6. Avoid Large In-Memory Arrays

**❌ Bad** (loads everything):

```javascript
const allMessages = await messages.find({}).toArray();
// Memory: 10,000 messages × 1KB = 10MB
```

**✅ Good** (use cursor):

```javascript
const cursor = messages.find({});

await cursor.forEach((message) => {
  // Process one at a time
  console.log(message);
});
```

---

## Backup & Recovery

### MongoDB Atlas Backups (Automatic)

MongoDB Atlas provides automatic backups:

- **Continuous backups** (snapshots every 6 hours)
- **Point-in-time recovery** (restore to any time in last 7 days)
- **Managed by MongoDB** (no configuration needed)

### Manual Backups

**Export Collection**:

```bash
# Export devices collection to JSON
mongoexport --uri="mongodb+srv://..." \
  --db=pushflow \
  --collection=devices \
  --out=devices-backup.json

# Export messages collection
mongoexport --uri="mongodb+srv://..." \
  --db=pushflow \
  --collection=messages \
  --out=messages-backup.json
```

**Import Collection**:

```bash
# Import devices collection
mongoimport --uri="mongodb+srv://..." \
  --db=pushflow \
  --collection=devices \
  --file=devices-backup.json

# Import messages collection
mongoimport --uri="mongodb+srv://..." \
  --db=pushflow \
  --collection=messages \
  --file=messages-backup.json
```

### Backup Strategy

**Daily Backups**:

```javascript
// Automated backup script
const { MongoClient } = require('mongodb');
const fs = require('fs');

async function backupDatabase() {
  const client = await MongoClient.connect(process.env.MONGODB_URI);
  const db = client.db(process.env.MONGODB_DB_NAME);

  // Export devices
  const devices = await db.collection('devices').find({}).toArray();
  fs.writeFileSync(`backup-devices-${Date.now()}.json`, JSON.stringify(devices, null, 2));

  // Export messages
  const messages = await db.collection('messages').find({}).toArray();
  fs.writeFileSync(`backup-messages-${Date.now()}.json`, JSON.stringify(messages, null, 2));

  await client.close();
  console.log('Backup completed');
}

// Run daily
setInterval(backupDatabase, 24 * 60 * 60 * 1000);
```

---

## Monitoring & Debugging

### Query Performance Monitoring

```javascript
// Log slow queries
const slowQueryThreshold = 100; // ms

const originalFind = devices.find.bind(devices);
devices.find = function (...args) {
  const start = Date.now();
  const cursor = originalFind(...args);

  cursor.toArray = async function () {
    const result = await originalFind(...args).toArray();
    const duration = Date.now() - start;

    if (duration > slowQueryThreshold) {
      console.warn('Slow query:', {
        collection: 'devices',
        duration,
        query: args[0],
      });
    }

    return result;
  };

  return cursor;
};
```

### Connection Monitoring

```javascript
client.on('serverOpening', () => {
  console.log('Opening MongoDB connection');
});

client.on('serverClosed', () => {
  console.log('MongoDB connection closed');
});

client.on('error', (error) => {
  console.error('MongoDB error:', error);
});
```

---

## Best Practices

### 1. Always Use Indexes

✅ Create indexes for frequently queried fields
✅ Use compound indexes for multiple-field queries
✅ Monitor index usage with `.explain()`

### 2. Limit Query Results

✅ Always use `.limit()` for list queries
✅ Implement pagination for large datasets
✅ Use projections to reduce data transfer

### 3. Connection Management

✅ Reuse single MongoClient instance
✅ Configure connection pooling
✅ Handle connection errors gracefully

### 4. Data Cleanup

✅ Remove stale subscriptions (expired devices)
✅ Archive old messages periodically
✅ Implement TTL indexes for automatic cleanup

### 5. Monitoring

✅ Log slow queries
✅ Monitor connection pool metrics
✅ Set up alerts for errors

---

## Conclusion

The database layer is a critical component of PushFlow, providing persistent storage for device subscriptions and message history. MongoDB's flexible document model, powerful indexing, and connection pooling make it ideal for handling push notification subscriptions at scale. Proper index design, query optimization, and connection management ensure the system remains fast and reliable even as the number of devices grows. Regular monitoring, backups, and data cleanup procedures maintain database health and performance over time.
