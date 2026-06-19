const { Pool } = require('pg');
require('dotenv').config();

const shardConfigs = [
  {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: 'orders_shard_0',
    password: process.env.DB_PASSWORD,
    port: 5431,
  },
  {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: 'orders_shard_1',
    password: process.env.DB_PASSWORD,
    port: 5432,
  },
  {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: 'orders_shard_2',
    password: process.env.DB_PASSWORD,
    port: 5433,
  }
];

const pools = shardConfigs.map(config => new Pool(config));
console.log('[DATABASE] Initialized 3 separate connection pools for horizontal sharding.');

module.exports = pools;