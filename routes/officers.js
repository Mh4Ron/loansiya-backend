const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { Storage } = require('@google-cloud/storage');

require('dotenv').config(); // ✅ Load env

// 🟡 GCS Setup with base64 support
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
const accountsBucket = storage.bucket(process.env.ACCOUNTS_BUCKET);

// 🔹 GET /officers — Return list of officers
router.get('/', async (req, res) => {
  try {
    const file = accountsBucket.file('loan_officers.json');
    const [contents] = await file.download();
    const officers = JSON.parse(contents.toString());
    res.json(officers);
  } catch (error) {
    console.error('❌ Failed to load loan officers:', error);
    res.status(500).json({ error: 'Failed to load officer accounts' });
  }
});

// 🔹 POST /officers/login — Verify officer credentials
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const file = accountsBucket.file('loan_officers.json');
    const [contents] = await file.download();
    const officers = JSON.parse(contents.toString());

    const officer = officers.find((o) => o.username === username);

    if (!officer || officer.status.toLowerCase() !== 'active') {
      return res.status(401).json({ success: false, error: 'Invalid or inactive account' });
    }

    const passwordMatch = await bcrypt.compare(password, officer.password);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'Incorrect password' });
    }

    res.status(200).json({ success: true, officer });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

module.exports = router;
