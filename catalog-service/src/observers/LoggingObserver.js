import { bookEventBus } from './BookEventBus.js';

export class LoggingObserver {
  static register() {
    bookEventBus.on('book.created', (book) => {
      console.log(`[Observer] Book created: ${book.title} (ID: ${book.id})`);
    });

    bookEventBus.on('book.updated', (book) => {
      console.log(`[Observer] Book updated: ${book.title} (ID: ${book.id})`);
    });

    bookEventBus.on('book.deleted', (book) => {
      console.log(`[Observer] Book deleted: ${book.title} (ID: ${book.id})`);
    });

    bookEventBus.on('book.recommended', (data) => {
      console.log(`[Observer] Book recommendation generated for interest: ${data.interest}`);
    });
  }
}
