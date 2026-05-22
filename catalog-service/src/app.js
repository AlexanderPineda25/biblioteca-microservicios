import cors from 'cors';
import express from 'express';
import bookRoutes from './routes/book.routes.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import { config } from './config/env.js';

const app = express();

// Middlewares globales
app.use(cors({
  origin: config.corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check sin autenticación
app.get('/api/catalog/health', (req, res) => {
  res.json({
    success: true,
    message: 'Catalog Service is running',
    timestamp: new Date().toISOString()
  });
});

// Rutas
app.use('/api/catalog/books', bookRoutes);

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
