import express from 'express';
import { ChatController } from '../controllers/chat.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/messages', authMiddleware, ChatController.sendMessage);

export default router;
