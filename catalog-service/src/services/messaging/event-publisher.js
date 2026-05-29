export class EventPublisher {
  constructor(connectionManager) {
    this._connectionManager = connectionManager;
    this._sender = null;
  }

  async init() {
    const client = this._connectionManager.getClient();
    if (!client) throw new Error('Service Bus not connected');

    const queueName = (await import('../../config/env.js')).config.messaging.azureServiceBusQueue;
    this._sender = client.createSender(queueName);
  }

  async publish(routingKey, message) {
    if (!this._sender) {
      console.warn(`[Azure SB] Sender not ready, event '${routingKey}' not published.`);
      return false;
    }

    const payload = {
      event: routingKey,
      timestamp: new Date().toISOString(),
      data: message,
    };

    try {
      await this._sender.sendMessages({
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

  isReady() {
    return !!this._sender;
  }
}
