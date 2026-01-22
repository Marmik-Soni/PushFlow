import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config();

const { MONGODB_URI, MONGODB_DB_NAME = 'pushflow' } = process.env;

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI is required in the environment.');
}

let client;

async function getClient() {
  if (!client) {
    client = new MongoClient(MONGODB_URI, {
      appName: 'pushflow',
      retryWrites: true,
    });
    await client.connect();
  }
  return client;
}

async function getDb() {
  const activeClient = await getClient();
  return activeClient.db(MONGODB_DB_NAME);
}

async function getCollections() {
  const db = await getDb();
  const devices = db.collection('devices');
  const messages = db.collection('messages');

  // Create indexes for better query performance
  await devices.createIndex({ deviceId: 1 }, { unique: true });
  await devices.createIndex({ lastSeen: -1 });
  await devices.createIndex({ createdAt: -1 });
  await messages.createIndex({ createdAt: -1 });
  await messages.createIndex({ deviceId: 1 });

  return { devices, messages };
}

export { getDb, getCollections };
