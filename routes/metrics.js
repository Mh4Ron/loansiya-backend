const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { Storage } = require('@google-cloud/storage');
const { saveClientMetrics } = require('../utils/gcsHelper');

require('dotenv').config();

// 🔐 Base64 or local JSON for GCS service account
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

// ⬇️ POST /metrics/:cid – compute and store processed metrics
router.post('/metrics/:cid', async (req, res) => {
  try {
    const cid = req.params.cid;
    const file = bucket.file(`client-metrics/${cid}-raw.json`);
    const contents = await file.download();
    const raw = JSON.parse(contents.toString());

    // ✅ Compute metrics
    const totalPayments = raw.paymentHistoryLog.reduce((sum, l) => sum + l.onTimePayments + l.latePayments, 0);
    const onTimePayments = raw.paymentHistoryLog.reduce((sum, l) => sum + l.onTimePayments, 0);
    const paymentHistory = (onTimePayments / totalPayments) * 100;

    const creditUtilization = (raw.utilizationData.totalUsed / raw.utilizationData.totalCreditLimit) * 100;

    const creditHistoryLength = Math.floor(
      (Date.now() - new Date(raw.creditHistoryStartDate).getTime()) / (1000 * 60 * 60 * 24 * 30)
    );

    const creditMix = Math.min(raw.creditAccounts.length * 10, 100);

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const newInquiries = raw.loanHistory?.filter(entry => {
      const appliedDate = new Date(entry.dateApplied);
      return appliedDate >= oneYearAgo;
    }).length || 0;

    const computedMetrics = {
      cid,
      paymentHistory,
      creditUtilization,
      creditHistoryLength,
      creditMix,
      newInquiries,
    };

    await saveClientMetrics(cid, computedMetrics);
    res.json(computedMetrics);
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute and upload metrics', details: err.message });
  }
});

module.exports = router;
