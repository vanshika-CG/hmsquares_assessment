const crypto = require('crypto');

const SHARD_COUNT = 3;


function getShardIndex(customerId) {
  if (!customerId) return 0;
  const hash = crypto.createHash('md5').update(customerId).digest('hex');
  const intValue = parseInt(hash.substring(0, 8), 16);
  return intValue % SHARD_COUNT;
}

module.exports = { getShardIndex, SHARD_COUNT };