import { config } from '../../config/env.js';

let ServiceBusClient;
try {
  const azureSdk = await import('@azure/service-bus');
  ServiceBusClient = azureSdk.ServiceBusClient;
} catch (_) {
  console.error('✗ [@azure/service-bus] Package not installed. Azure Service Bus is required.');
}

export class ServiceBusConnectionManager {
  constructor() {
    this._client = null;
  }

  async connect() {
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
      this._client = new ServiceBusClient(connStr);

      const testReceiver = this._client.createReceiver(queueName);
      await testReceiver.peekMessages(1);
      await testReceiver.close();

      console.log('✓ [Azure Service Bus] Connected successfully.');
    } catch (err) {
      console.error(`✗ [Azure Service Bus] Connection failed: ${err.message}`);
      if (this._client) { await this._client.close().catch(() => {}); }
      this._client = null;
      throw err;
    }
  }

  getClient() {
    return this._client;
  }

  get isConnected() {
    return !!this._client;
  }

  async disconnect() {
    if (this._client) {
      await this._client.close().catch(() => {});
      this._client = null;
    }
  }
}
