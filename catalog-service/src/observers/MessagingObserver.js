import { messagingService } from '../services/messaging.service.js';
import { bookEventBus } from './BookEventBus.js';

export class MessagingObserver {
  static register() {
    bookEventBus.on('book.created', async (book) => {
      await messagingService.publishEvent('book.created', {
        id: book.id,
        title: book.title,
        author: book.author,
        isbn: book.isbn
      });
    });

    bookEventBus.on('book.updated', async (book) => {
      await messagingService.publishEvent('book.updated', {
        id: book.id,
        title: book.title,
        author: book.author
      });
    });

    bookEventBus.on('book.deleted', async (book) => {
      await messagingService.publishEvent('book.deleted', {
        id: book.id,
        title: book.title
      });
    });

    bookEventBus.on('book.recommended', async (data) => {
      await messagingService.publishEvent('book.recommended', data);
    });
  }
}
