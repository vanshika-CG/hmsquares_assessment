const fs = require('fs');
const csv = require('csv-parser');
const { bucket } = require('../config/gcs');
const { getShardIndex } = require('../utils/shardRouter');
const pools = require('../config/db');

const BATCH_SIZE = 1000;

const uploadAndProcessOrders = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded." });
  }

  const localFilePath = req.file.path;
  const gcsFileName = `orders_${Date.now()}.csv`;

  try {
    console.log(`[GCS] Uploading ${req.file.originalname} using Application Default Credentials...`);
    await bucket.upload(localFilePath, { destination: gcsFileName });
    console.log(`[GCS] Upload complete.`);

    const shardBatches = { 0: [], 1: [], 2: [] };
    let totalProcessed = 0;
    let failedRecordsCount = 0;

    const flushBatch = async (shardIdx) => {
      const records = shardBatches[shardIdx];
      if (records.length === 0) return;

      const pool = pools[shardIdx];
      const queryValues = [];
      const queryRows = [];
      let paramIndex = 1;

      records.forEach(row => {
        queryRows.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`);
        queryValues.push(row.order_id, row.customer_id, row.order_date, row.order_amount, row.status);
        paramIndex += 5;
      });

      const sqlText = `
        INSERT INTO orders (order_id, customer_id, order_date, order_amount, status) 
        VALUES ${queryRows.join(', ')}
      `;

      await pool.query(sqlText, queryValues);
      console.log(`[DATABASE] Flushed batch of ${records.length} records into Shard #${shardIdx}`);
      shardBatches[shardIdx] = [];
    };

    console.log(`[STREAM] Backpressure-aware processing started...`);
    const stream = fs.createReadStream(localFilePath).pipe(csv());

    stream.on('data', async (row) => {
      if (!row.order_id || !row.customer_id || !row.order_amount || !row.status) {
        failedRecordsCount++;
        return;
      }

      const shardIdx = getShardIndex(row.customer_id);
      
      shardBatches[shardIdx].push({
        order_id: row.order_id,
        customer_id: row.customer_id,
        order_date: row.order_date,
        order_amount: parseFloat(row.order_amount),
        status: row.status
      });

      totalProcessed++;

      if (shardBatches[shardIdx].length >= BATCH_SIZE) {
        stream.pause();
        await flushBatch(shardIdx);
        stream.resume();
      }
    });

    stream.on('end', async () => {
      for (let i = 0; i < 3; i++) {
        if (shardBatches[i].length > 0) {
          await flushBatch(i);
        }
      }

      console.log(`[STREAM] Finished parsing all records.`);
      if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);

      return res.status(200).json({
        success: true,
        message: "Orders uploaded and handled successfully.",
        gcs_destination: gcsFileName,
        metrics: {
          total_inserted: totalProcessed,
          malformed_skipped: failedRecordsCount
        }
      });
    });

    stream.on('error', (err) => {
      console.error("[STREAM ERROR]", err);
      if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
      res.status(500).json({ success: false, error: "Data processing stream failed." });
    });

  } catch (error) {
    console.error("[SERVER ERROR] Controller crash:", error);
    if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
    return res.status(500).json({ success: false, error: "Internal Processing Failure." });
  }
};


const getOrdersByCustomer = async (req, res) => {
  const { customerId } = req.query;
  if (!customerId) {
    return res.status(400).json({ success: false, error: "Missing customerId query parameter." });
  }

  try {
    const shardIdx = getShardIndex(customerId);
    const pool = pools[shardIdx];

    const result = await pool.query(
      'SELECT * FROM orders WHERE customer_id = $1 ORDER BY order_date DESC',
      [customerId]
    );

    return res.status(200).json({
      success: true,
      shard_queried: shardIdx,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error("[LOOKUP ERROR]", error);
    return res.status(500).json({ success: false, error: "Failed to query customer orders." });
  }
};


const getOrderById = async (req, res) => {
  const { orderId } = req.params;

  try {
    // Scatter-Gather pattern: Scan all pools in parallel since shard key is absent
    const scans = pools.map(pool => 
      pool.query('SELECT * FROM orders WHERE order_id = $1', [orderId]).catch(() => ({ rows: [] }))
    );
    
    const datasets = await Promise.all(scans);
    const orderMatch = datasets.map(res => res.rows).find(rows => rows.length > 0);

    if (!orderMatch) {
      return res.status(404).json({ success: false, error: "Order not found on any system database shard." });
    }

    return res.status(200).json({ success: true, data: orderMatch[0] });
  } catch (error) {
    console.error("[LOOKUP ERROR]", error);
    return res.status(500).json({ success: false, error: "Failed to locate individual order record." });
  }
};

module.exports = { uploadAndProcessOrders, getOrdersByCustomer, getOrderById };