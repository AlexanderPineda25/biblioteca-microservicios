import { EventEmitter } from 'events';

class BookEventBus extends EventEmitter {
  static instance;

  constructor() {
    if (BookEventBus.instance) {
      return BookEventBus.instance;
    }
    super();
    BookEventBus.instance = this;
  }

  static getInstance() {
    if (!BookEventBus.instance) {
      new BookEventBus();
    }
    return BookEventBus.instance;
  }

  emitBookCreated(book) {
    this.emit('book.created', book);
  }

  emitBookUpdated(book) {
    this.emit('book.updated', book);
  }

  emitBookDeleted(book) {
    this.emit('book.deleted', book);
  }

  emitBookRecommended(data) {
    this.emit('book.recommended', data);
  }
}

export const bookEventBus = BookEventBus.getInstance();
