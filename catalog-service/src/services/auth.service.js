import axios from 'axios';
import { config } from '../config/env.js';

const AUTH_SERVICE_TIMEOUT = 5000;

export class AuthService {
  static async introspectToken(token) {
    try {
      const response = await axios.post(
        `${config.authServiceUrl}/api/auth/introspect`,
        { token },
        { timeout: AUTH_SERVICE_TIMEOUT }
      );

      return response.data;
    } catch (error) {
      if (error.code === 'ECONNREFUSED' || 
          error.code === 'ETIMEDOUT' || 
          error.message.includes('timeout')) {
        const err = new Error('Auth service unavailable');
        err.statusCode = 503;
        throw err;
      }

      if (error.response) {
        return error.response.data;
      }

      const err = new Error('Auth service unavailable');
      err.statusCode = 503;
      throw err;
    }
  }
}
