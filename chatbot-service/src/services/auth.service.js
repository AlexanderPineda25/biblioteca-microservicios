import axios from 'axios';
import { config } from '../config/env.js';

const AUTH_SERVICE_TIMEOUT = 5000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 200;
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_RESET_TIMEOUT = 30000;

class CircuitBreaker {
  constructor() {
    this._failures = 0;
    this._state = 'closed';
    this._lastFailureTime = null;
  }

  get isOpen() {
    if (this._state === 'open') {
      if (Date.now() - this._lastFailureTime > CIRCUIT_RESET_TIMEOUT) {
        this._state = 'half-open';
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess() {
    this._failures = 0;
    this._state = 'closed';
  }

  recordFailure() {
    this._failures++;
    this._lastFailureTime = Date.now();
    if (this._failures >= CIRCUIT_BREAKER_THRESHOLD) {
      this._state = 'open';
    }
  }
}

class AuthHttpClient {
  constructor(baseURL) {
    this._client = axios.create({ baseURL, timeout: AUTH_SERVICE_TIMEOUT });
    this._circuitBreaker = new CircuitBreaker();
  }

  async introspect(token) {
    if (this._circuitBreaker.isOpen) {
      console.warn('[AuthService] Circuit breaker open. Skipping introspection.');
      const err = new Error('Auth service unavailable (circuit breaker open)');
      err.statusCode = 503;
      throw err;
    }

    let lastError;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
        console.warn(`[AuthService] Retry attempt ${attempt + 1}/${MAX_RETRIES} after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      try {
        const response = await this._client.post('/api/auth/introspect', { token });
        this._circuitBreaker.recordSuccess();
        return response.data;
      } catch (error) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
          lastError = new Error('Auth service unavailable');
          lastError.statusCode = 503;
          this._circuitBreaker.recordFailure();
          continue;
        }

        if (error.response) {
          return error.response.data;
        }

        lastError = new Error('Auth service unavailable');
        lastError.statusCode = 503;
        this._circuitBreaker.recordFailure();
      }
    }

    throw lastError;
  }
}

export class AuthService {
  constructor(httpClient) {
    this._httpClient = httpClient || new AuthHttpClient(config.authServiceUrl);
  }

  async introspectToken(token) {
    return this._httpClient.introspect(token);
  }
}

export const authService = new AuthService();
