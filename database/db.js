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
  return {
    devices: db.collection('devices'),
    messages: db.collection('messages'),
  };
}

export { getDb, getCollections };
