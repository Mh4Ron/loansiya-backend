const express = require('express');
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs');
const dayjs = require('dayjs');
const router = express.Router();
require('dotenv').config();

// 🔐 GCS Setup (support base64 for Render)
let serviceAccountPath;

if (process.env.SERVICE_ACCOUNT_B64) {
  const decoded = Buffer.from(process.env.SERVICE_ACCOUNT_B64, 'base64').toString('utf-8');
  const tempPath = path.join(__dirname, '..', 'temp-service-account.json');
  fs.writeFileSync(tempPath, decoded);
  serviceAccountPath = tempPath;
} else {
  serviceAccountPath = path.join(__dirname, '..', process.env.SERVICE_ACCOUNT);
}

const storage = new Storage({ keyFilename: serviceAccountPath });
const bucket = storage.bucket(process.env.CLIENT_BUCKET);

// 🔄 Unified Upload Controller Logic
router.post('/:clientId/:fileType', async (req, res) => {
  const { clientId, fileType } = req.params;

  if (!clientId || !fileType) {
    return res.status(400).json({ error: 'Missing clientId or fileType' });
  }

  const validTypes = ['application', 'agreement'];
  if (!validTypes.includes(fileType)) {
    return res.status(400).json({ error: 'Invalid fileType. Must be application or agreement.' });
  }

  try {
    const dateOnly = dayjs().format('YYYY-MM-DD');
    const filename = `loan-${fileType}.json`;
    const destination = `clients/${clientId}/${dateOnly}/${filename}`;

    const file = bucket.file(destination);
    await file.save(JSON.stringify(req.body), {
      contentType: 'application/json',
    });

    res.status(200).json({
      message: `${filename} uploaded successfully for ${clientId}`,
      path: destination,
    });
  } catch (error) {
    console.error('❌ GCS Upload Error:', error);
    res.status(500).json({ error: 'Upload failed', details: error.message });
  }
});

module.exports = router;
