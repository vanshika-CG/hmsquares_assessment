
# 🚀 Sharded Backend Order Ingestion System

A scalable, high-performance **Node.js** backend engineered to stream, validate, and batch-insert large transaction datasets across a horizontally sharded **PostgreSQL** database cluster, while automatically backing up uploaded CSV files to **Google Cloud Storage (GCS)**.

---

## 📖 Overview

This project demonstrates how to build a production-ready backend capable of processing large CSV files efficiently using **Node.js Streams**, distributing records across multiple PostgreSQL databases using **Application-Level Sharding**, and securely storing uploaded files in **Google Cloud Storage** using **Application Default Credentials (ADC)**.

The system is optimized for high throughput, low memory consumption, and scalable database writes.

---

# ✨ Features

-  Application-Level Sharding across 3 PostgreSQL databases
-  Memory-efficient CSV processing using Node.js Streams
-  Batch database inserts (1000 records per batch)
-  Automatic invalid row filtering
-  Google Cloud Storage backup of uploaded CSV files
-  Secure authentication using Google ADC (No service account keys)
-  Dockerized infrastructure
-  Health monitoring endpoint
-  Optimized customer lookup using shard routing
-  Scatter-Gather search for Order ID lookups

---

# 🛠 Tech Stack

| Category | Technology |
|-----------|------------|
| Runtime | Node.js v18+ |
| Framework | Express.js |
| Database | PostgreSQL 15 |
| Storage | Google Cloud Storage |
| Streaming | Node.js Streams |
| Containerization | Docker & Docker Compose |
| Authentication | Google Application Default Credentials |
| Language | JavaScript |

---

# 🏗 System Architecture

```
                CSV Upload
                     │
                     ▼
             Express API Server
                     │
          Upload to Google Cloud Storage
                     │
                     ▼
           Stream CSV Row-by-Row
                     │
        Validate & Filter Bad Records
                     │
                     ▼
       Determine Target Database Shard
                     │
      Batch Records (1000 per Insert)
                     │
      ┌─────────┬─────────┬─────────┐
      ▼         ▼         ▼
 PostgreSQL  PostgreSQL PostgreSQL
   Shard 1     Shard 2     Shard 3
```

---

# 🧩 Sharding Strategy

## Shard Key

```
customer_id
```

Each record is routed based on its `customer_id`.

---

## Routing Algorithm

The routing logic follows these steps:

1. Generate an MD5 hash of the `customer_id`.
2. Take the first 8 hexadecimal characters.
3. Convert them into an integer.
4. Compute:

```text
hash % 3
```

Result:

| Result | Target |
|---------|--------|
| 0 | Shard 1 |
| 1 | Shard 2 |
| 2 | Shard 3 |

This deterministic approach guarantees that all transactions belonging to the same customer always reside in the same database shard.

---

# 📈 Advantages

- Excellent horizontal scalability
- Reduced database contention
- Fast customer-specific queries
- Even distribution of data
- Easy addition of more shards in the future

---

# ⚠ Trade-offs

### Advantages

- High write throughput
- Better database performance
- Customer data locality
- Reduced locking

### Limitations

Looking up an order using only `order_id` requires querying every shard because the partition key (`customer_id`) is unknown.

This is solved using a **Scatter-Gather** query pattern.

---

# 📂 API Endpoints

---

## 1. Upload Orders

### POST `/upload-orders`

Uploads a CSV file.

### Workflow

- Accept CSV upload
- Upload original file to GCS
- Stream file row-by-row
- Validate records
- Skip malformed rows
- Route records to shards
- Batch insert every 1000 rows

### Request

Multipart Form Data

```
file: orders.csv
```

### Response

```json
{
  "processed": 10000,
  "inserted": 9985,
  "invalid": 15
}
```

---

## 2. Customer Lookup

### GET `/orders?customerId=<customer_id>`

Uses deterministic shard routing to directly query the correct database.

Example

```
GET /orders?customerId=cust_101
```

---

## 3. Order Lookup

### GET `/orders/:orderId`

Uses a Scatter-Gather query strategy.

Example

```
GET /orders/ord_201
```

The API simultaneously queries all shards using `Promise.all()` and returns the matching order.

---

## 4. Health Check

### GET `/health`

Checks connectivity of all PostgreSQL shards.

Example Response

```json
{
  "status": "healthy",
  "shards": [
    "connected",
    "connected",
    "connected"
  ]
}
```

---

# ⚙ Local Setup

## Prerequisites

Install:

- Docker Desktop
- Docker Compose
- Node.js v18+
- Google Cloud SDK (gcloud CLI)

---

# Configure Google Cloud Authentication

Instead of storing JSON service account keys inside the repository, this project uses **Google Application Default Credentials (ADC)**.

Run:

```bash
gcloud auth application-default login
```

After successful login, credentials are stored locally in:

```
~/.config/gcloud
```

The Docker container mounts this directory, allowing the Google Cloud Storage SDK to authenticate automatically.

---

# Environment Variables

Create a `.env` file.

Example:

```env
PORT=

GCP_PROJECT_ID=

GCS_BUCKET_NAME=

DB_USER=

DB_PASSWORD=

DB_HOST=

```

---

# Run the Project

Build and start everything using Docker Compose.

```bash
docker-compose up --build
```

The API starts at:

```
http://localhost:5000
```

---

# Example CSV

```csv
order_id,customer_id,order_date,order_amount,status
ord_201,cust_101,2026-06-18 10:00:00,150.75,completed
ord_202,cust_102,2026-06-18 10:15:22,2400.00,pending
ord_203,cust_103,2026-06-18 10:30:00,500.50,completed
```

---

# 📊 API Testing

## Health Check

### GET `/health`

Verify:

- API is running
- All PostgreSQL shards are connected

<img width="368" height="99" alt="Screenshot 2026-06-19 161142" src="https://github.com/user-attachments/assets/d36f25a9-d425-473d-a017-db17fcd562e0" />

---

## Upload Orders

### POST `/upload-orders`

Upload:

```
orders.csv
```

Verify:

- Uploaded successfully
- Invalid rows skipped
- Batch insertion completed


<img width="425" height="160" alt="Screenshot 2026-06-19 162327" src="https://github.com/user-attachments/assets/ed69d579-46ba-442d-9e36-eb7d5c79cb54" />

---

## Customer Lookup

### GET `/orders?customerId=cust_101`

Verify deterministic shard routing.

<img width="407" height="282" alt="Screenshot 2026-06-19 162822" src="https://github.com/user-attachments/assets/909802fc-0ef9-4190-a982-c3322a84f4ba" />

---

## Order Lookup

### GET `/orders/ord_201`

Verify Scatter-Gather query execution.

<img width="393" height="130" alt="Screenshot 2026-06-19 162619" src="https://github.com/user-attachments/assets/d744020c-d8fe-4bb6-975b-872222c0f596" />

---

# 📁 Project Structure

```
.
├── src
│   ├── routes
│   ├── controllers
│   ├── services
│   ├── shard
│   ├── db
│   ├── utils
│   └── app.js
│
├── uploads
├── screenshots
├── docker-compose.yml
├── Dockerfile
├── package.json
├── .env.example
└── README.md
```

---

# 🚀 Performance Highlights

- Streaming CSV processing (No full file loading)
- Constant memory usage
- Automatic stream backpressure handling
- Parameterized batch inserts
- Horizontal database scaling
- Parallel shard queries
- Secure cloud storage integration

---

# 🔒 Security

- No service account keys stored in the repository
- Uses Google Application Default Credentials (ADC)
- Parameterized SQL queries prevent SQL Injection
- Environment variables for configuration
- Docker network isolation

---

# 👩‍💻 Author

**Vanshika Jangam**

B.Tech Computer Science & Engineering

Full Stack Developer

---
