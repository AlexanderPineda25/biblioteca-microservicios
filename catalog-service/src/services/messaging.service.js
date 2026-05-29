/**
 * Azure Service Bus Messaging Service
 *
 * Provides publish/subscribe messaging via Azure Service Bus.
 * Azure Service Bus is the primary messaging broker (RabbitMQ removed).
 */

import { config } from '../config/env.js';

let ServiceBusClient;
try {
  const azureSdk = await import('@azure/service-bus');
  ServiceBusClient = azureSdk.ServiceBusClient;
} catch (_) {
  console.error('✗ [@azure/service-bus] Package not installed. Azure Service Bus is required.');
}

// ─── Internal state ──────────────────────────────────────────────────────────
let _azureClient = null;     // ServiceBusClient instance
let _azureSender = null;     // ServiceBusSender for publishing
let _azureReceiver = null;   // ServiceBusReceiver for consuming

// ─── Public service class ────────────────────────────────────────────────────
export class MessagingService {

  // ── connect ──────────────────────────────────────────────────────────────────
  static async connect() {
    const connStr = config.messaging.azureServiceBusConnectionString;

    if (!connStr) {
      throw new Error('AZURE_SERVICE_BUS_CONNECTION_STRING is not set. Azure Service Bus connection string is required.');
    }

    if (!ServiceBusClient) {
      throw new Error('@azure/service-bus package is not available. Please install it: npm install @azure/service-bus');
    }

    const queueName = config.messaging.azureServiceBusQueue;
    console.log(`[Messaging] Connecting to Azure Service Bus. Queue: "${queueName}"`);

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
      if (_azureClient) { await _azureClient.close().catch(() => {}); }
      _azureClient = null;
      _azureSender = null;
      throw err;
    }
  }

  // ── publishEvent ────────────────────────────────────────────────────────────
  static async publishEvent(routingKey, message) {
    const payload = {
      event: routingKey,
      timestamp: new Date().toISOString(),
      data: message,
    };

    return this._publishAzure(payload, routingKey);
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

  // ── startListening ──────────────────────────────────────────────────────────
  static async startListening() {
    await this._listenAzure();
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

  // ── helpers for status / health ─────────────────────────────────────────────
  static get isReady() {
    return !!_azureSender;
  }

  static async disconnect() {
    if (_azureReceiver) {
      await _azureReceiver.close().catch(() => {});
    }
    if (_azureClient) {
      await _azureClient.close().catch(() => {});
    }
    _azureClient = null;
    _azureSender = null;
    _azureReceiver = null;
  }
}
