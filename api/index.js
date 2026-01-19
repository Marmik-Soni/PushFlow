import { getCollections } from '../database/db.js';
import app from '../server.mjs';

let isInitialized = false;

export default async function handler(req, res) {
  try {
    // Initialize MongoDB connection on first request
    if (!isInitialized) {
      await getCollections();
      isInitialized = true;
    }

    // Handle the request with Express app
    return app(req, res);
  } catch (error) {
    console.error('Serverless function error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
}
