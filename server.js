const express = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const upload = require('./middleware/upload');
const { uploadAndProcessOrders, getOrdersByCustomer, getOrderById } = require('./controllers/orderController');
const pools = require('./config/db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}


// Routes
app.post('/upload-orders', upload.single('file'), uploadAndProcessOrders);
app.get('/orders', getOrdersByCustomer);
app.get('/orders/:orderId', getOrderById);



// Health Check
app.get('/health', async (req, res) => {
  try {
    await Promise.all(pools.map(pool => pool.query('SELECT 1')));
    res.status(200).json({
      success: true,
      status: "UP",
      message: "Express system operating seamlessly. All 3 database shards online."
    });
  } catch (error) {
    res.status(500).json({ success: false, status: "DOWN", error: "Database connections dropping context." });
  }
});

app.listen(PORT, () => {
  console.log(`[SERVER] Listening on http://localhost:${PORT}`);
});