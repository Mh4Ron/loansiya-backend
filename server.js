// server.js
require('dotenv').config(); // Load env variables

const express = require('express');
const cors = require('cors');
const app = express();

// ✅ Routes
const scoringRoute = require('./routes/scoring');
const metricsRoute = require('./routes/metrics'); 
const uploadRoute = require('./routes/upload');
const documentsRoute = require('./routes/documents');
const officersRoute = require('./routes/officers');

// ✅ GCS helper (for direct client fetch)
const { getAllClients } = require('./utils/gcsHelper');

const PORT = process.env.PORT || 5600;

app.use(cors());
app.use(express.json());

// ✅ Modular routes
app.use('/score', scoringRoute);
app.use('/', metricsRoute);
app.use('/upload', uploadRoute);
app.use('/documents', documentsRoute);
app.use('/officers', officersRoute);

// ✅ Add this route to allow GET /client/:cid to work as before
app.get('/client/:cid', async (req, res) => {
  try {
    const clients = await getAllClients();
    const client = clients.find((c) => c.cid === req.params.cid);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load client', details: err.message });
  }
});


// ✅ for getting client name
app.get('/client/:cid/name', async (req, res) => {
  try {
    const cid = req.params.cid;
    const clients = await getAllClients();
    const client = clients.find(c => c.cid === cid);

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

// 🟢 Start server
app.listen(PORT, () => {
  console.log(`✅ LOANSIYA Backend running on http://localhost:${PORT}`);
});
