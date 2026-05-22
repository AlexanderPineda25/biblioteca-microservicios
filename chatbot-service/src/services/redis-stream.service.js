import { createClient } from 'redis';
import { config } from '../config/env.js';

let client = null;
let ready = false;
let loggerStarted = false;

const serializePayload = (payload) => JSON.stringify(payload ?? {});

export class RedisStreamService {
  static async connect() {
    if (!config.redis.url) {
      console.warn('[Redis Streams] REDIS_URL is empty. Event stream disabled.');
      return;
    }

    try {
      client = createClient({ url: config.redis.url });
      client.on('error', (error) => {
        ready = false;
        console.error(`[Redis Streams] Client error: ${error.message}`);
      });

      await client.connect();
      ready = true;

      try {
        await client.xGroupCreate(config.redis.streamName, config.redis.groupName, '0', {
          MKSTREAM: true
        });
        console.log(`[Redis Streams] Consumer group "${config.redis.groupName}" created.`);
      } catch (error) {
        if (!String(error.message).includes('BUSYGROUP')) {
          throw error;
        }
      }

      console.log(`[Redis Streams] Connected to ${config.redis.streamName}.`);
    } catch (error) {
      ready = false;
      console.error(`[Redis Streams] Connection failed: ${error.message}`);
      console.warn('[Redis Streams] Chatbot will continue without event streaming.');
    }
  }

  static async publishEvent(event, payload) {
    if (!ready || !client) return false;

    try {
      await client.xAdd(config.redis.streamName, '*', {
        event,
        timestamp: new Date().toISOString(),
        payload: serializePayload(payload)
      });
      return true;
    } catch (error) {
      console.error(`[Redis Streams] Failed to publish "${event}": ${error.message}`);
      return false;
    }
  }

  static startLogger() {
    if (!ready || !client || loggerStarted) return;
    loggerStarted = true;

    const loop = async () => {
      while (ready && client) {
        try {
          const response = await client.xReadGroup(
            config.redis.groupName,
            config.redis.consumerName,
            [{ key: config.redis.streamName, id: '>' }],
            { COUNT: 10, BLOCK: 5000 }
          );

          if (!response) continue;

          for (const stream of response) {
            for (const message of stream.messages) {
              const { event, timestamp, payload } = message.message;
              console.log('\n=========================================');
              console.log('[REDIS STREAM EVENT RECEIVED]');
              console.log(`Evento: ${event}`);
              console.log(`Fecha:  ${timestamp}`);
              console.log('Datos:', payload);
              console.log('=========================================\n');
              await client.xAck(config.redis.streamName, config.redis.groupName, message.id);
            }
          }
        } catch (error) {
          console.error(`[Redis Streams] Consumer error: ${error.message}`);
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    };

    loop();
    console.log(`[Redis Streams] Logger consumer active on "${config.redis.streamName}".`);
  }

  static get isReady() {
    return ready;
  }
}
