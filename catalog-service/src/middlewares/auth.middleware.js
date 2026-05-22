import { AuthService } from '../services/auth.service.js';

export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid authorization header'
      });
    }

    const token = authHeader.substring(7);

    const introspectResult = await AuthService.introspectToken(token);

    if (!introspectResult.active) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    req.user = {
      userId: introspectResult.userId,
      username: introspectResult.username,
      roles: introspectResult.roles || [],
      permissions: introspectResult.permissions || []
    };

    next();
  } catch (error) {
    if (error.statusCode === 503) {
      return res.status(503).json({
        success: false,
        error: 'Auth service unavailable'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};
