const express = require('express');
const multer = require('multer');
const fs = require('fs');
const router = express.Router();
const path = require('path');
const { Storage } = require('@google-cloud/storage');
require('dotenv').config();

// 🗂 Multer setup – store temporarily in /uploads
const upload = multer({ dest: 'uploads/' });

// 🔐 Support base64 or file-based service account
let serviceAccountPath;
if (process.env.SERVICE_ACCOUNT_B64) {
  const decoded = Buffer.from(process.env.SERVICE_ACCOUNT_B64, 'base64').toString('utf-8');
  const tempPath = path.join(__dirname, '..', 'temp-service-account.json');
  fs.writeFileSync(tempPath, decoded);
  serviceAccountPath = tempPath;
} else {
  serviceAccountPath = path.join(__dirname, '..', process.env.SERVICE_ACCOUNT);
}

// ☁️ Google Cloud Storage config
const storage = new Storage({ keyFilename: serviceAccountPath });
const clientBucket = storage.bucket(process.env.CLIENT_BUCKET);

// 🟢 POST /upload – Upload file to GCS
router.post('/', upload.single('document'), async (req, res) => {
  try {
    const file = req.file;
    const cid = req.body.cid || 'UnknownCID';
    const fileType = req.body.fileType || 'document';

    const today = new Date().toLocaleDateString('en-CA'); // Format: YYYY-MM-DD
    const ext = file.originalname.split('.').pop();
    const filename = `${fileType.toLowerCase()}.${ext}`;
    const destination = `documents/${cid}/${today}/${filename}`;

    console.log(`📄 Uploading ${filename} to GCS path: ${destination}`);

    await clientBucket.upload(file.path, {
      destination,
      gzip: true,
      metadata: { cacheControl: 'no-cache' },
    });

    const [signedUrl] = await clientBucket.file(destination).getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
      responseDisposition: 'inline',
    });

    fs.unlinkSync(file.path);

    res.status(200).json({
      success: true,
      fileUrl: signedUrl,
      uploadedTo: destination,
    });
  } catch (err) {
    console.error('❌ Upload Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 🟢 GET /client/:cid/name – Fetch client name from clients.json
router.get('/client/:cid/name', async (req, res) => {
  const cid = req.params.cid;
  const file = clientBucket.file('clients/clients.json');

  try {
    const [contents] = await file.download();
    const allClients = JSON.parse(contents.toString());

    const client = allClients.find((c) => c.cid === cid);

    if (client) {
      res.status(200).json({ success: true, name: client.name });
    } else {
      res.status(404).json({ success: false, error: 'Client not found' });
    }
  } catch (err) {
    console.error('❌ Error retrieving client name:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch client data' });
  }
});

module.exports = router;
