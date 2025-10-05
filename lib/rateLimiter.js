import { kv } from '@vercel/kv';

export class RateLimiter {
  static async checkLimit(userId, maxRequests = 20, windowSeconds = 60) {
    const key = `ratelimit:${userId}`;
    const now = Date.now();
    const windowStart = now - (windowSeconds * 1000);
    
    // Remove old entries
    await kv.zremrangebyscore(key, '-inf', windowStart);
    
    // Count requests in current window
    const requestCount = await kv.zcard(key);
    
    if (requestCount >= maxRequests) {
      const oldestRequest = await kv.zrange(key, 0, 0, { withScores: true });
      const resetTime = oldestRequest[0]?.score + (windowSeconds * 1000);
      const waitSeconds = Math.ceil((resetTime - now) / 1000);
      
      return {
        allowed: false,
        waitSeconds,
        message: `Terlalu banyak request. Tunggu ${waitSeconds} detik.`
      };
    }
    
    // Add current request
    await kv.zadd(key, { score: now, member: now.toString() });
    await kv.expire(key, windowSeconds * 2);
    
    return {
      allowed: true,
      remaining: maxRequests - requestCount - 1
    };
  }
}