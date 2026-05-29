import express from 'express';
import { query, param, body, validationResult } from 'express-validator';
import { BookCrudController } from '../controllers/book-crud.controller.js';
import { BookAiController } from '../controllers/book-ai.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { requireRoles } from '../middlewares/roles.middleware.js';

const router = express.Router();

const validateUUID = param('id')
  .isUUID()
  .withMessage('Invalid book ID format');

const validateTitle = body('title')
  .trim()
  .notEmpty()
  .withMessage('Title is required');

const validateAuthor = body('author')
  .trim()
  .notEmpty()
  .withMessage('Author is required');

const validateBook = [
  validateTitle,
  validateAuthor,
  body('isbn').optional().trim().isLength({ min: 1 }),
  body('editorial').optional().trim(),
  body('year').optional().isInt({ min: 1000, max: new Date().getFullYear() + 5 }),
  body('categories').optional().isArray().withMessage('Categories must be an array'),
  body('totalCopies').optional().isInt({ min: 1 }).withMessage('Total copies must be at least 1'),
  body('availableCopies').optional().isInt({ min: 0 }).withMessage('Available copies must be non-negative'),
  body('description').optional().trim()
];

const validateAvailability = [
  param('id').isUUID().withMessage('Invalid book ID format'),
  body('availableCopies')
    .isInt({ min: 0 })
    .withMessage('Available copies must be a non-negative integer')
];

const validateAiRecommendation = [
  body('interest')
    .trim()
    .isLength({ min: 4, max: 300 })
    .withMessage('Interest must contain between 4 and 300 characters')
];

const writeRoles = ['Admin', 'Bibliotecario'];

// GET /books - listar libros con filtros
router.get(
  '/',
  authMiddleware,
  [
    query('title').optional().trim(),
    query('author').optional().trim(),
    query('category').optional().trim(),
    query('available').optional().isIn(['true', 'false']),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
  ],
  BookCrudController.listBooks
);

// GET /books/available - libros disponibles (ANTES de :id)
router.get(
  '/available',
  authMiddleware,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
  ],
  BookCrudController.listAvailableBooks
);

// POST /books/ai/recommendations - recomendar libros usando una API externa de IA
router.post(
  '/ai/recommendations',
  authMiddleware,
  validateAiRecommendation,
  BookAiController.recommendBooks
);

// GET /books/:id - obtener detalle de un libro
router.get(
  '/:id',
  authMiddleware,
  validateUUID,
  BookCrudController.getBook
);

// POST /books - crear un libro
router.post(
  '/',
  authMiddleware,
  requireRoles(writeRoles),
  validateBook,
  BookCrudController.createBook
);

// PUT /books/:id - editar un libro
router.put(
  '/:id',
  authMiddleware,
  requireRoles(writeRoles),
  [validateUUID, ...validateBook],
  BookCrudController.updateBook
);

// DELETE /books/:id - eliminar un libro
router.delete(
  '/:id',
  authMiddleware,
  requireRoles(writeRoles),
  validateUUID,
  BookCrudController.deleteBook
);

// PATCH /books/:id/availability - actualizar disponibilidad
router.patch(
  '/:id/availability',
  authMiddleware,
  requireRoles(writeRoles),
  validateAvailability,
  BookCrudController.updateAvailability
);

export default router;
