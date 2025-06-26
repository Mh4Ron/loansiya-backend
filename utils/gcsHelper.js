const { Storage } = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// 🔐 Detect and decode base64-encoded service account (for Render)
let serviceAccountPath;

if (process.env.SERVICE_ACCOUNT_B64) {
  const decoded = Buffer.from(process.env.SERVICE_ACCOUNT_B64, 'base64').toString('utf-8');
  const tempPath = path.join(__dirname, 'temp-service-account.json');
  fs.writeFileSync(tempPath, decoded);
  serviceAccountPath = tempPath;
} else {
  // 🧪 Local dev fallback
  serviceAccountPath = path.join(__dirname, '..', process.env.SERVICE_ACCOUNT);
}

// 🪣 GCS Setup
const storage = new Storage({ keyFilename: serviceAccountPath });
const clientBucket = storage.bucket(process.env.CLIENT_BUCKET);

// 🔁 Helper functions
const getAllClients = async () => {
  const file = clientBucket.file('clients/clients.json');
  const [contents] = await file.download();
  return JSON.parse(contents.toString());
};

const saveClientData = async (cid, data) => {
  const file = clientBucket.file(`clients/${cid}.json`);
  await file.save(JSON.stringify(data, null, 2), { contentType: 'application/json' });
};

const saveClientMetrics = async (cid, metrics) => {
  const file = clientBucket.file(`client-metrics/processed/${cid}.json`);
  await file.save(JSON.stringify(metrics, null, 2), { contentType: 'application/json' });
};

const getClientData = async (cid) => {
  const file = clientBucket.file(`scores/${cid}.json`);
  const [contents] = await file.download();
  return JSON.parse(contents.toString());
};

// 📦 Export
module.exports = {
  getAllClients,
  saveClientData,
  saveClientMetrics,
  getClientData,
};
