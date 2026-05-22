/**
 * Messaging Service — dual broker support
 *
 * Priority:
 *   1. Azure Service Bus  – when AZURE_SERVICE_BUS_CONNECTION_STRING is set
 *   2. RabbitMQ           – default for local / offline development
 *
 * Both branches expose the same static API used by book.controller.js:
 *   - RabbitMqService.connect()
 *   - RabbitMqService.publishEvent(routingKey, message)
 *   - RabbitMqService.startListening()
 */

import amqp from 'amqplib';
import { config } from '../config/env.js';

// Conditionally import Azure SDK only when the connection string is set
// (avoids hard failures when the SDK is present but unused)
let ServiceBusClient;
try {
  const azureSdk = await import('@azure/service-bus');
  ServiceBusClient = azureSdk.ServiceBusClient;
} catch (_) {
  // Package not installed — Azure Service Bus will be unavailable
}

// ─── RabbitMQ constants ───────────────────────────────────────────────────────
const EXCHANGE_NAME = 'library_events';
const QUEUE_NAME = 'library_logging_queue';

// ─── Internal state ───────────────────────────────────────────────────────────
let _mode = 'rabbitmq'; // 'azure' | 'rabbitmq'
let _rabbitConnection = null;
let _rabbitChannel = null;
let _azureSender = null;     // ServiceBusSender for publishing
let _azureReceiver = null;   // ServiceBusReceiver for consuming
let _azureClient = null;     // ServiceBusClient instance

// ─── Public service class (same API as before) ────────────────────────────────
export class RabbitMqService {

  // ── connect ─────────────────────────────────────────────────────────────────
  static async connect() {
    const connStr = config.messaging.azureServiceBusConnectionString;

    if (connStr && ServiceBusClient) {
      // ── Azure Service Bus branch ──
      _mode = 'azure';
      const queueName = config.messaging.azureServiceBusQueue;
      console.log(`[Messaging] Azure Service Bus mode. Queue: "${queueName}"`);

      try {
        _azureClient = new ServiceBusClient(connStr);
        _azureSender = _azureClient.createSender(queueName);

        // Verify connectivity by peeking
        const testReceiver = _azureClient.createReceiver(queueName);
        await testReceiver.peekMessages(1);
        await testReceiver.close();

        console.log('✓ [Azure Service Bus] Connected successfully.');
      } catch (err) {
        console.error(`✗ [Azure Service Bus] Connection failed: ${err.message}`);
        console.warn('[Messaging] Falling back to RabbitMQ...');
        _mode = 'rabbitmq';
        if (_azureClient) { await _azureClient.close().catch(() => {}); }
        _azureClient = null;
        _azureSender = null;
        await this._connectRabbitMQ();
      }
    } else {
      if (connStr && !ServiceBusClient) {
        console.warn('[Messaging] AZURE_SERVICE_BUS_CONNECTION_STRING is set but @azure/service-bus package is not available. Falling back to RabbitMQ.');
      }
      // ── RabbitMQ branch ──
      _mode = 'rabbitmq';
      await this._connectRabbitMQ();
    }
  }

  // ── internal RabbitMQ connect (with retry) ───────────────────────────────────
  static async _connectRabbitMQ() {
    const rabbitmqUrl = config.messaging.rabbitmqUrl;
    console.log(`[RabbitMQ] Connecting to broker at ${rabbitmqUrl}...`);

    for (let attempt = 1; attempt <= 15; attempt++) {
      try {
        _rabbitConnection = await amqp.connect(rabbitmqUrl);
        _rabbitChannel = await _rabbitConnection.createChannel();
        await _rabbitChannel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
        console.log('✓ [RabbitMQ] Connected successfully & exchange declared.');
        return;
      } catch (error) {
        console.error(`✗ [RabbitMQ] Connection attempt ${attempt} failed: ${error.message}`);
        if (attempt === 15) {
          console.error('✗ [RabbitMQ] Maximum attempts reached. Service will run without broker.');
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }

  // ── publishEvent ────────────────────────────────────────────────────────────
  static async publishEvent(routingKey, message) {
    const payload = {
      event: routingKey,
      timestamp: new Date().toISOString(),
      data: message,
    };

    if (_mode === 'azure') {
      return this._publishAzure(payload, routingKey);
    }
    return this._publishRabbit(payload, routingKey);
  }

  static async _publishAzure(payload, routingKey) {
    if (!_azureSender) {
      console.warn(`[Azure SB] Sender not ready, event '${routingKey}' not published.`);
      return false;
    }
    try {
      await _azureSender.sendMessages({
        body: payload,
        contentType: 'application/json',
        subject: routingKey
      });
      console.log(`✓ [Azure Service Bus] Event '${routingKey}' published.`);
      return true;
    } catch (err) {
      console.error(`✗ [Azure Service Bus] Failed to publish '${routingKey}': ${err.message}`);
      return false;
    }
  }

  static async _publishRabbit(payload, routingKey) {
    if (!_rabbitChannel) {
      console.warn(`[RabbitMQ] Channel not ready, event '${routingKey}' not published.`);
      return false;
    }
    try {
      const buffer = Buffer.from(JSON.stringify(payload));
      _rabbitChannel.publish(EXCHANGE_NAME, routingKey, buffer, { persistent: true });
      console.log(`✓ [RabbitMQ] Event '${routingKey}' successfully published.`);
      return true;
    } catch (error) {
      console.error(`✗ [RabbitMQ] Failed to publish event '${routingKey}': ${error.message}`);
      return false;
    }
  }

  // ── startListening ──────────────────────────────────────────────────────────
  static async startListening() {
    if (_mode === 'azure') {
      await this._listenAzure();
    } else {
      await this._listenRabbit();
    }
  }

  static async _listenAzure() {
    if (!_azureClient) {
      console.warn('[Azure SB] Client not ready, consumer could not start.');
      return;
    }
    try {
      const queueName = config.messaging.azureServiceBusQueue;
      _azureReceiver = _azureClient.createReceiver(queueName);

      _azureReceiver.subscribe({
        processMessage: async (msg) => {
          console.log('\n=========================================');
          console.log('📬 [AZURE SERVICE BUS EVENT RECEIVED]');
          console.log(`Evento: ${msg.subject || msg.body?.event || 'unknown'}`);
          console.log(`Fecha:  ${msg.body?.timestamp || new Date().toISOString()}`);
          console.log('Datos:', JSON.stringify(msg.body?.data || msg.body, null, 2));
          console.log('=========================================\n');
        },
        processError: async (err) => {
          console.error('✗ [Azure SB] Consumer error:', err.message);
        }
      });

      console.log(`✓ [Azure Service Bus] Consumer active on queue "${queueName}".`);
    } catch (err) {
      console.error('✗ [Azure SB] Error setting up consumer:', err.message);
    }
  }

  static async _listenRabbit() {
    if (!_rabbitChannel) {
      console.warn('[RabbitMQ] Channel not ready, logger consumer could not start.');
      return;
    }
    try {
      await _rabbitChannel.assertQueue(QUEUE_NAME, { durable: true });
      await _rabbitChannel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, 'book.#');
      console.log('✓ [RabbitMQ] Logger queue bound to exchange. Consumer active.');

      _rabbitChannel.consume(
        QUEUE_NAME,
        (msg) => {
          if (msg !== null) {
            try {
              const content = JSON.parse(msg.content.toString());
              console.log('\n=========================================');
              console.log('📬 [RABBITMQ EVENT RECEIVED - BONUS DEMO]');
              console.log(`Evento: ${content.event}`);
              console.log(`Fecha:  ${content.timestamp}`);
              console.log('Datos:', JSON.stringify(content.data, null, 2));
              console.log('=========================================\n');
              _rabbitChannel.ack(msg);
            } catch (err) {
              console.error('✗ [RabbitMQ] Error parsing incoming message:', err.message);
              _rabbitChannel.nack(msg);
            }
          }
        },
        { noAck: false }
      );
    } catch (error) {
      console.error('✗ [RabbitMQ] Error setting up logger consumer:', error.message);
    }
  }

  // ── helpers for status / health ─────────────────────────────────────────────
  static get mode() { return _mode; }
  static get isReady() {
    return _mode === 'azure' ? !!_azureSender : !!_rabbitChannel;
  }
}
