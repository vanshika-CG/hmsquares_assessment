const { Storage } = require('@google-cloud/storage');
require('dotenv').config();


const storage = new Storage({
  projectId: process.env.GCP_PROJECT_ID
});

const bucketName = process.env.GCS_BUCKET_NAME;
const bucket = storage.bucket(bucketName);

module.exports = { bucket };