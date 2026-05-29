import { ServiceBusConnectionManager } from './messaging/connection-manager.js';
import { EventPublisher } from './messaging/event-publisher.js';
import { EventConsumer } from './messaging/event-consumer.js';

class MessagingService {
  constructor() {
    this.connectionManager = new ServiceBusConnectionManager();
    this.publisher = new EventPublisher(this.connectionManager);
    this.consumer = new EventConsumer(this.connectionManager);
  }

  async connect() {
    await this.connectionManager.connect();
    await this.publisher.init();
  }

  async publishEvent(routingKey, message) {
    return this.publisher.publish(routingKey, message);
  }

  async startListening() {
    return this.consumer.start();
  }

  get isReady() {
    return this.publisher.isReady();
  }

  async disconnect() {
    await this.consumer.stop();
    await this.connectionManager.disconnect();
  }
}

export const messagingService = new MessagingService();
