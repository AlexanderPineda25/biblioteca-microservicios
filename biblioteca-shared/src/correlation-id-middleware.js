import { randomUUID } from 'crypto';

export function createCorrelationIdMiddleware() {
  return (req, res, next) => {
    const correlationId = req.headers['x-correlation-id'] || randomUUID();
    req.correlationId = correlationId;
    res.setHeader('X-Correlation-Id', correlationId);
    next();
  };
}
