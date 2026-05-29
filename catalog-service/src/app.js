import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import bookRoutes from './routes/book.routes.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import { correlationIdMiddleware } from './middlewares/correlation-id.middleware.js';
import { apiLimiter, aiLimiter } from './middlewares/rate-limit.middleware.js';
import { config } from './config/env.js';

const app = express();

// Middlewares globales
app.use(cookieParser());

app.use(cors({
  origin: config.corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id'],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(correlationIdMiddleware);
app.use('/api/', apiLimiter);

// Health check sin autenticación
app.get('/api/catalog/health', (req, res) => {
  res.json({
    success: true,
    message: 'Catalog Service is running',
    correlationId: req.correlationId,
    timestamp: new Date().toISOString()
  });
});

// Rutas
app.use('/api/catalog/books', bookRoutes);
app.use('/api/catalog/books/ai/recommendations', aiLimiter);

// Ruta no encontrada
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Middleware de errores (debe ser el último)
app.use(errorMiddleware);

export default app;
