/**
 * Dev Harbour — Distributed & Resilient Rate Limiting Layer
 * Supports Redis when configured (REDIS_URL) with seamless in-memory fallback.
 * Prevents DDoS, brute-force attacks, and credential stuffing.
 */

require('dotenv').config();

let Redis = null;
try {
  Redis = require('ioredis');
} catch {
  Redis = null;
}

let redisClient = null;
let isRedisReady = false;

if (Redis && process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null // Don't loop endlessly if local redis is not running
    });

    redisClient.on('connect', () => {
      isRedisReady = true;
      console.log('⚡ Connected to Redis for distributed rate limiting.');
    });

    redisClient.on('error', (err) => {
      isRedisReady = false;
      // Suppress unhandled error log on local dev where Redis might not be running
    });

    // Try connecting once non-blockingly
    redisClient.connect().catch(() => {
      isRedisReady = false;
    });
  } catch (err) {
    isRedisReady = false;
  }
}

// In-Memory Fallback Map
const memoryStore = new Map();

// Periodic cleanup of expired entries in memory store
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of memoryStore.entries()) {
    if (now > value.resetTime) {
      memoryStore.delete(key);
    }
  }
}, 60000).unref();

function rateLimit({ windowMs = 60000, max = 15, message = 'Too many requests. Please try again later.' } = {}) {
  return async (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const key = `ratelimit:${req.baseUrl || ''}${req.path}:${ip}`;
    const now = Date.now();

    // 1. Try Redis first if healthy
    if (isRedisReady && redisClient) {
      try {
        const current = await redisClient.incr(key);
        if (current === 1) {
          await redisClient.pexpire(key, windowMs);
        }
        const ttl = await redisClient.pttl(key);
        const retryAfter = Math.max(1, Math.ceil(ttl / 1000));

        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, max - current));

        if (current > max) {
          res.setHeader('Retry-After', retryAfter);
          return res.status(429).json({ error: message, retryAfter });
        }
        return next();
      } catch (redisErr) {
        // Fall back to memoryStore below
        isRedisReady = false;
      }
    }

    // 2. In-Memory Fallback
    let record = memoryStore.get(key);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      memoryStore.set(key, record);
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', max - 1);
      return next();
    }

    record.count++;
    const retryAfter = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));

    if (record.count > max) {
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({ error: message, retryAfter });
    }

    next();
  };
}

module.exports = {
  rateLimit,
  isRedisActive: () => isRedisReady
};
