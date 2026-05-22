import Book from '../models/book.model.js';
import { Op } from 'sequelize';

export class BookService {
  static async getAllBooks(filters = {}, pagination = {}) {
    const { title, author, category, available } = filters;
    const { page = 1, limit = 10 } = pagination;

    const offset = (page - 1) * limit;
    const where = {};

    if (title) {
      where.title = { [Op.iLike]: `%${title}%` };
    }

    if (author) {
      where.author = { [Op.iLike]: `%${author}%` };
    }

    if (available === 'true' || available === true) {
      where.availableCopies = { [Op.gt]: 0 };
    }

    let include = [];
    if (category) {
      include = [];
      where.categories = {
        [Op.contains]: [category]
      };
    }

    const { count, rows } = await Book.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total: count
      }
    };
  }

  static async getAvailableBooks(pagination = {}) {
    const { page = 1, limit = 10 } = pagination;
    const offset = (page - 1) * limit;

    const { count, rows } = await Book.findAndCountAll({
      where: {
        availableCopies: { [Op.gt]: 0 }
      },
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total: count
      }
    };
  }

  static async getBookById(id) {
    const book = await Book.findByPk(id);

    if (!book) {
      const error = new Error('Book not found');
      error.statusCode = 404;
      throw error;
    }

    return book;
  }

  static async createBook(bookData) {
    const book = await Book.create(bookData);
    return book;
  }

  static async updateBook(id, bookData) {
    const book = await this.getBookById(id);

    await book.update(bookData);
    return book;
  }

  static async deleteBook(id) {
    const book = await this.getBookById(id);
    await book.destroy();
    return book;
  }

  static async updateAvailability(id, availableCopies) {
    const book = await this.getBookById(id);

    if (availableCopies < 0 || availableCopies > book.totalCopies) {
      const error = new Error(
        `Available copies must be between 0 and ${book.totalCopies}`
      );
      error.statusCode = 400;
      throw error;
    }

    await book.update({ availableCopies });
    return book;
  }
}
