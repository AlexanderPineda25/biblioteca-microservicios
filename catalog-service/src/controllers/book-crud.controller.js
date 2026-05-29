import { BookService } from '../services/book.service.js';
import { bookEventBus } from '../observers/BookEventBus.js';
import { validationResult } from 'express-validator';

const handleValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error(errors.array()[0].msg);
    error.statusCode = 400;
    throw error;
  }
};

export class BookCrudController {
  static async listBooks(req, res, next) {
    try {
      handleValidationErrors(req, res);

      const filters = {
        title: req.query.title,
        author: req.query.author,
        category: req.query.category,
        available: req.query.available
      };

      const pagination = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 10
      };

      const result = await BookService.getAllBooks(filters, pagination);

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }

  static async listAvailableBooks(req, res, next) {
    try {
      handleValidationErrors(req, res);

      const pagination = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 10
      };

      const result = await BookService.getAvailableBooks(pagination);

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }

  static async getBook(req, res, next) {
    try {
      handleValidationErrors(req, res);

      const book = await BookService.getBookById(req.params.id);

      res.json({
        success: true,
        data: book
      });
    } catch (error) {
      next(error);
    }
  }

  static async createBook(req, res, next) {
    try {
      handleValidationErrors(req, res);

      const book = await BookService.createBook(req.body);
      bookEventBus.emitBookCreated(book);

      res.status(201).json({
        success: true,
        data: book
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateBook(req, res, next) {
    try {
      handleValidationErrors(req, res);

      const book = await BookService.updateBook(req.params.id, req.body);
      bookEventBus.emitBookUpdated(book);

      res.json({
        success: true,
        data: book
      });
    } catch (error) {
      next(error);
    }
  }

  static async deleteBook(req, res, next) {
    try {
      handleValidationErrors(req, res);

      const book = await BookService.deleteBook(req.params.id);
      bookEventBus.emitBookDeleted(book);

      res.json({
        success: true,
        data: book
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateAvailability(req, res, next) {
    try {
      handleValidationErrors(req, res);

      const { availableCopies } = req.body;
      const book = await BookService.updateAvailability(
        req.params.id,
        availableCopies
      );

      res.json({
        success: true,
        data: book
      });
    } catch (error) {
      next(error);
    }
  }
}
