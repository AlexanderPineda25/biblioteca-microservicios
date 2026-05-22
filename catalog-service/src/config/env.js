import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
  let currentDir = __dirname;
  for (let i = 0; i < 5; i++) {
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

const requiredEnvVars = [
  'PORT',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'AUTH_SERVICE_URL'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(', ')}\n` +
    `Please check your .env file and ensure all required variables are set.`
  );
}

export const config = {
  port: parseInt(process.env.PORT, 10),
  database: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    dialect: 'postgres'
  },
  authServiceUrl: process.env.AUTH_SERVICE_URL,
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:4173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean),
  ai: {
    provider: process.env.AI_PROVIDER || 'huggingface',
    huggingFaceApiToken: process.env.HF_API_TOKEN || '',
    huggingFaceModel: process.env.HF_MODEL || 'facebook/bart-large-mnli',
    chatProvider: process.env.CHAT_PROVIDER || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    groqApiKey: process.env.GROQ_API_KEY || '',
    openRouterApiKey: process.env.OPENROUTER_API_KEY || ''
  },
  messaging: {
    azureServiceBusConnectionString: process.env.AZURE_SERVICE_BUS_CONNECTION_STRING || '',
    azureServiceBusQueue: process.env.AZURE_SERVICE_BUS_QUEUE || 'library-logging-queue',
    rabbitmqUrl: process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672'
  },
  nodeEnv: process.env.NODE_ENV || 'development'
};
