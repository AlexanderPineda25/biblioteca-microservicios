import cors from 'cors';
import express from 'express';
import chatRoutes from './routes/chat.routes.js';
import { config } from './config/env.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import { RedisStreamService } from './services/redis-stream.service.js';

const app = express();

app.use(cors({
  origin: config.corsOrigins,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/chatbot/health', (req, res) => {
  res.json({
    success: true,
    message: 'Chatbot Service is running',
    aiProvider: config.ai.provider || 'auto',
    redisStreams: {
      enabled: Boolean(config.redis.url),
      ready: RedisStreamService.isReady,
      stream: config.redis.streamName
    },
    timestamp: new Date().toISOString()
  });
});

app.use('/api/chatbot', chatRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

app.use(errorMiddleware);

export default app;
