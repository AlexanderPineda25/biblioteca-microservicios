import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
  let currentDir = __dirname;
  for (let i = 0; i < 6; i++) {
    const envPath = path.join(currentDir, '.env');
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      return;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  dotenv.config();
}

loadEnv();

const missingEnvVars = ['PORT', 'AUTH_SERVICE_URL'].filter((envVar) => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(', ')}\n` +
    'Please check your .env file and ensure all required variables are set.'
  );
}

const splitCorsOrigins = (value) => (value || 'http://localhost:4173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const config = {
  port: parseInt(process.env.PORT, 10),
  authServiceUrl: process.env.AUTH_SERVICE_URL,
  catalogServiceUrl: process.env.CATALOG_SERVICE_URL || 'http://catalog-service:3002',
  corsOrigins: splitCorsOrigins(process.env.CORS_ORIGINS),
  ai: {
    provider: (process.env.CHATBOT_PROVIDER || process.env.CHAT_PROVIDER || '').toLowerCase(),
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    groqApiKey: process.env.GROQ_API_KEY || '',
    groqModel: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
    openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
    openRouterModel: process.env.OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct:free',
    openRouterReferer: process.env.OPENROUTER_REFERER || 'http://localhost:4173',
    openRouterTitle: process.env.OPENROUTER_TITLE || 'Biblioteca U'
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://redis:6379',
    streamName: process.env.CHATBOT_STREAM_NAME || 'chatbot_events',
    groupName: process.env.CHATBOT_STREAM_GROUP || 'chatbot_logger',
    consumerName: process.env.CHATBOT_STREAM_CONSUMER || `chatbot-service-${Math.random().toString(16).slice(2)}`
  },
  nodeEnv: process.env.NODE_ENV || 'development'
};
