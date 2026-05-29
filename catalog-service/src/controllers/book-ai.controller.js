import { BookService } from '../services/book.service.js';
import { AiService } from '../services/ai.service.js';
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

const aiService = new AiService();

export class BookAiController {
  static async recommendBooks(req, res, next) {
    try {
      handleValidationErrors(req, res);

      const result = await BookService.getAllBooks(
        { available: 'true' },
        { page: 1, limit: 50 }
      );

      const recommendation = await aiService.recommendBooks({
        interest: req.body.interest,
        books: result.data
      });
      bookEventBus.emitBookRecommended({
        interest: req.body.interest,
        recommendation: recommendation.recommendation,
        model: recommendation.model,
        provider: recommendation.provider
      });

      res.json({
        success: true,
        data: recommendation
      });
    } catch (error) {
      next(error);
    }
  }
}
