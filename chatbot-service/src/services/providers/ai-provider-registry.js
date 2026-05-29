import { config } from '../../config/env.js';
import { GeminiProvider, GroqProvider, OpenRouterProvider } from './ai-chat-provider.js';

export class AiProviderRegistry {
  constructor() {
    this._providers = {
      gemini: new GeminiProvider(),
      groq: new GroqProvider(),
      openrouter: new OpenRouterProvider(),
    };

    this._localFallback = {
      name: 'local-fallback',
      model: 'rule-based',
      ask: async ({ message }) => ({
        provider: 'local-fallback',
        model: 'rule-based',
        reply: this._buildFallbackAnswer(message),
      }),
    };
  }

  getProviderOrder() {
    const enabled = Object.values(this._providers).filter((p) => p.enabled);

    if (!config.ai.provider) return enabled.map((p) => p);

    const preferred = enabled.filter((p) => p.name === config.ai.provider);
    const rest = enabled.filter((p) => p.name !== config.ai.provider);
    return [...preferred, ...rest];
  }

  getAllProviders() {
    return [...this.getProviderOrder(), this._localFallback];
  }

  _buildFallbackAnswer(message) {
    const trimText = (value, maxLength = 4000) => String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);

    return (
      'En este momento no pude conectarme con Gemini, Groq ni OpenRouter, pero sigo disponible con una respuesta local. ' +
      `Tu pregunta fue: "${trimText(message, 220)}". ` +
      'Para preguntas sobre libros, intenta buscar por titulo, autor o categoria en el catalogo; si necesitas una recomendacion, dime el tema, nivel y objetivo de estudio.'
    );
  }
}
