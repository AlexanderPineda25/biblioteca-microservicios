import { config } from '../config/env.js';
import { AiProviderRegistry } from './providers/ai-provider-registry.js';
import { catalogContextService } from './catalog-context.service.js';

const trimText = (value, maxLength = 4000) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maxLength);

const buildSystemPrompt = ({ user, catalogContext }) => (
  'Eres el chatbot IA de Biblioteca U. Responde en espanol claro, cercano y breve. ' +
  'Ayudas a estudiantes, bibliotecarios y administradores con preguntas sobre el catalogo, recomendaciones, uso de la plataforma y conceptos academicos. ' +
  'Cuando la pregunta sea sobre libros disponibles, usa el contexto del catalogo y no inventes disponibilidad. ' +
  'Si no tienes informacion suficiente, dilo y sugiere una busqueda concreta en el catalogo. ' +
  `Usuario autenticado: ${user?.username || 'usuario'}.\n\n` +
  `Contexto actual del catalogo disponible:\n${catalogContext}`
);

export class ChatbotService {
  constructor(catalogContext, providerRegistry) {
    this._catalogContext = catalogContext;
    this._providerRegistry = providerRegistry || new AiProviderRegistry();
  }

  async answer({ message, history, user, accessToken }) {
    const catalogContext = await this._catalogContext.getCatalogSnapshot(accessToken);
    const systemPrompt = buildSystemPrompt({ user, catalogContext });
    const providers = this._providerRegistry.getAllProviders();

    for (const provider of providers) {
      if (provider.name === 'local-fallback') {
        const result = await provider.ask({ message });
        return {
          ...result,
          reply: result.reply.trim(),
          fallbackUsed: true
        };
      }

      try {
        const result = await provider.ask({ systemPrompt, history, message });
        if (result.reply && result.reply.trim().length > 0) {
          return {
            ...result,
            reply: result.reply.trim(),
            fallbackUsed: false
          };
        }
      } catch (error) {
        console.warn(`[Chatbot] ${provider.name} failed: ${error.message}`);
      }
    }
  }
}

export const chatbotService = new ChatbotService(catalogContextService, new AiProviderRegistry());
