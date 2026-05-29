import { config } from '../../config/env.js';

export class EventConsumer {
  constructor(connectionManager) {
    this._connectionManager = connectionManager;
    this._receiver = null;
  }

  async start() {
    const client = this._connectionManager.getClient();
    if (!client) {
      console.warn('[Azure SB] Client not ready, consumer could not start.');
      return;
    }

    try {
      const queueName = config.messaging.azureServiceBusQueue;
      this._receiver = client.createReceiver(queueName);

      this._receiver.subscribe({
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

  async stop() {
    if (this._receiver) {
      await this._receiver.close().catch(() => {});
      this._receiver = null;
    }
  }
}
