import { randomUUID } from 'crypto';
import { ChatbotService } from '../services/chatbot.service.js';
import { RedisStreamService } from '../services/redis-stream.service.js';

const validateMessagePayload = (body) => {
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length < 2 || message.length > 1000) {
    const error = new Error('Message must contain between 2 and 1000 characters');
    error.statusCode = 400;
    throw error;
  }

  const history = Array.isArray(body.history)
    ? body.history
      .filter((item) => ['user', 'assistant'].includes(item?.role) && typeof item?.content === 'string')
      .slice(-8)
      .map((item) => ({
        role: item.role,
        content: item.content.trim().slice(0, 1000)
      }))
    : [];

  return {
    message,
    history,
    conversationId: body.conversationId || randomUUID()
  };
};

export class ChatController {
  static async sendMessage(req, res, next) {
    let conversationId = req.body?.conversationId || randomUUID();

    try {
      const payload = validateMessagePayload(req.body || {});
      conversationId = payload.conversationId;

      await RedisStreamService.publishEvent('chat.message.received', {
        conversationId,
        userId: req.user.userId,
        username: req.user.username,
        message: payload.message
      });

      const result = await ChatbotService.answer({
        message: payload.message,
        history: payload.history,
        conversationId,
        user: req.user,
        accessToken: req.accessToken
      });

      await RedisStreamService.publishEvent('chat.message.completed', {
        conversationId,
        userId: req.user.userId,
        provider: result.provider,
        model: result.model,
        fallbackUsed: result.fallbackUsed
      });

      res.json({
        success: true,
        data: {
          conversationId,
          reply: result.reply,
          provider: result.provider,
          model: result.model,
          fallbackUsed: result.fallbackUsed,
          redisStream: RedisStreamService.isReady,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      await RedisStreamService.publishEvent('chat.message.failed', {
        conversationId,
        userId: req.user?.userId,
        error: error.message
      });
      next(error);
    }
  }
}
