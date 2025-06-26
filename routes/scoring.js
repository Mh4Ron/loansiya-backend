const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { Storage } = require('@google-cloud/storage');
const { saveClientData, getAllClients } = require('../utils/gcsHelper');

require('dotenv').config();

// 🔐 Base64 service account support for Render
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
const clientBucket = storage.bucket(process.env.CLIENT_BUCKET);

// 🟢 Scoring weights
const weights = {
  paymentHistory: 0.35,
  creditUtilization: 0.30,
  creditHistoryLength: 0.15,
  creditMix: 0.10,
  newInquiries: 0.10,
};

const logisticWeights = {
  intercept: -4,
  paymentHistory: 5,
  creditUtilization: -3,
  creditHistoryLength: 2,
  creditMix: 1,
  newInquiries: -2,
};

// 🟢 Scoring Functions
function calculateCreditScore(data) {
  const normalized = {
    paymentHistory: data.paymentHistory / 100,
    creditUtilization: 1 - data.creditUtilization / 100,
    creditHistoryLength: Math.min(data.creditHistoryLength / 60, 1),
    creditMix: data.creditMix / 100,
    newInquiries: 1 - data.newInquiries / 100,
  };

  const weightedSum =
    weights.paymentHistory * normalized.paymentHistory +
    weights.creditUtilization * normalized.creditUtilization +
    weights.creditHistoryLength * normalized.creditHistoryLength +
    weights.creditMix * normalized.creditMix +
    weights.newInquiries * normalized.newInquiries;

  return Math.round(300 + weightedSum * 550);
}

function calculateDefaultProbability(data) {
  const z =
    logisticWeights.intercept +
    logisticWeights.paymentHistory * (data.paymentHistory / 100) +
    logisticWeights.creditUtilization * (data.creditUtilization / 100) +
    logisticWeights.creditHistoryLength * (data.creditHistoryLength / 100) +
    logisticWeights.creditMix * (data.creditMix / 100) +
    logisticWeights.newInquiries * (data.newInquiries / 100);

  return parseFloat((1 / (1 + Math.exp(-z))).toFixed(4));
}

function classifyRisk(score) {
  if (score >= 800) return 'Exceptional';
  if (score >= 740) return 'Very Good';
  if (score >= 670) return 'Good';
  if (score >= 580) return 'Fair';
  return 'Poor';
}

function getRecommendation(category) {
  if (category === 'Poor') return 'REVIEW OR DECLINE';
  if (category === 'Fair') return 'REVIEW';
  return 'APPROVE';
}

// 🔹 GET all clients
router.get('/clients', async (req, res) => {
  try {
    const clients = await getAllClients();
    res.json(clients);
  } catch (err) {
    console.error('❌ Error loading clients from GCS:', err);
    res.status(500).json({ error: 'Failed to load clients', details: err.message });
  }
});

// 🔹 GET one client
router.get('/client/:cid', async (req, res) => {
  try {
    const clients = await getAllClients();
    const client = clients.find((c) => c.cid === req.params.cid);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load client', details: err.message });
  }
});

// 🔹 POST /score/:cid
router.post('/:cid', async (req, res) => {
  try {
    const cid = req.params.cid;
    const processedFile = clientBucket.file(`client-metrics/processed/${cid}.json`);
    const contents = await processedFile.download();
    const metrics = JSON.parse(contents.toString());

    const creditScore = calculateCreditScore(metrics);
    const defaultProbability = calculateDefaultProbability(metrics);
    const riskCategory = classifyRisk(creditScore);
    const recommendation = getRecommendation(riskCategory);

    const result = {
      timestamp: new Date().toISOString(),
      cid,
      input: metrics,
      creditScore,
      defaultProbability,
      riskCategory,
      recommendation,
    };

    const scoreFile = clientBucket.file(`scores/${cid}.json`);
    await scoreFile.save(JSON.stringify(result, null, 2), {
      contentType: 'application/json',
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Scoring failed', details: err.message });
  }
});

module.exports = router;
