import app from './src/app.js';
import { config } from './src/config/env.js';
import { RedisStreamService } from './src/services/redis-stream.service.js';

async function startServer() {
  await RedisStreamService.connect();
  RedisStreamService.startLogger();

  app.listen(config.port, () => {
    console.log(`Chatbot Service running on port ${config.port}`);
    console.log(`AI provider priority: ${config.ai.provider || 'auto'}`);
    console.log(`Redis Streams: ${RedisStreamService.isReady ? 'connected' : 'disabled'}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start Chatbot Service:', error);
  process.exit(1);
});
