const axios = require('axios');
const Redis = require('ioredis');

class AxiosRedis {
  constructor(baseConfig = {}, options = {}) {
    this.axiosInstance = axios.create(baseConfig);
    this.retryCount = options.retryCount || 3;
    this.redis = new Redis(options.redisConfig || {}); // Redis connection
    this.cacheTTL = options.cacheTTL || 300; // Default TTL in seconds
  }

  /**
   * Store custom data in Redis
   * @param {string} key - The Redis key
   * @param {any} value - The value to store
   * @param {number} ttl - Time-to-live in seconds (optional)
   */
  async setData(key, value, ttl = this.cacheTTL) {
    await this.redis.setex(key, ttl, JSON.stringify(value));
  }

  /**
   * Retrieve custom data from Redis
   * @param {string} key - The Redis key
   * @returns {any} - Parsed value or null if not found
   */
  async getData(key) {
    const result = await this.redis.get(key);
    return result ? JSON.parse(result) : null;
  }

  /**
   * Delete custom data from Redis
   * @param {string} key - The Redis key
   */
  async deleteData(key) {
    await this.redis.del(key);
  }

  /**
   * Perform a GET request with Redis caching
   * @param {string} url - Request URL
   * @param {object} config - Axios request configuration
   * @param {boolean} useCache - Whether to use Redis for caching
   */
  async get(url, config = {}, useCache = false) {
    const cacheKey = this._generateCacheKey("GET", url, config);
    if (useCache) {
      const cachedResponse = await this.redis.get(cacheKey);
      if (cachedResponse) {
        return JSON.parse(cachedResponse); // Return cached response
      }
    }

    const response = await this._requestWithRetry(() =>
      this.axiosInstance.get(url, config)
    );

    if (useCache) {
      await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(response.data));
    }

    return response.data;
  }

  /**
   * Perform a POST request
   * @param {string} url - Request URL
   * @param {object} data - Data to send in the request body
   * @param {object} config - Axios request configuration
   */
  async post(url, data, config = {}) {
    const response = await this._requestWithRetry(() =>
      this.axiosInstance.post(url, data, config)
    );
    return response.data;
  }

  /**
   * Generate a unique cache key based on request parameters
   * @param {string} method - HTTP method
   * @param {string} url - Request URL
   * @param {object} config - Axios config
   * @returns {string} - Cache key
   */
  _generateCacheKey(method, url, config) {
    const serializedConfig = JSON.stringify(config || {});
    return `${method}:${url}:${serializedConfig}`;
  }

  /**
   * Internal method to handle retries
   * @param {function} requestFn - Request function
   */
  async _requestWithRetry(requestFn) {
    let attempt = 0;
    while (attempt < this.retryCount) {
      try {
        return await requestFn();
      } catch (error) {
        attempt++;
        if (attempt >= this.retryCount) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retrying
      }
    }
  }
}

module.exports = AxiosRedis;

