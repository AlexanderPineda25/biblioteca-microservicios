import axios from 'axios';
import { config } from '../config/env.js';
import { CatalogContextService } from './catalog-context.service.js';

const AI_TIMEOUT = 20000;

const trimText = (value, maxLength = 4000) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maxLength);

const getProviderOrder = () => {
  const providers = [
    { name: 'gemini', enabled: Boolean(config.ai.geminiApiKey) },
    { name: 'groq', enabled: Boolean(config.ai.groqApiKey) },
    { name: 'openrouter', enabled: Boolean(config.ai.openRouterApiKey) }
  ].filter((provider) => provider.enabled);

  if (!config.ai.provider) return providers.map((provider) => provider.name);

  return [
    ...providers.filter((provider) => provider.name === config.ai.provider),
    ...providers.filter((provider) => provider.name !== config.ai.provider)
  ].map((provider) => provider.name);
};

const normalizeHistory = (history = []) => history
  .filter((item) => ['user', 'assistant'].includes(item.role) && item.content)
  .slice(-8)
  .map((item) => ({
    role: item.role,
    content: trimText(item.content, 1200)
  }));

const buildSystemPrompt = ({ user, catalogContext }) => (
  'Eres el chatbot IA de Biblioteca U. Responde en espanol claro, cercano y breve. ' +
  'Ayudas a estudiantes, bibliotecarios y administradores con preguntas sobre el catalogo, recomendaciones, uso de la plataforma y conceptos academicos. ' +
  'Cuando la pregunta sea sobre libros disponibles, usa el contexto del catalogo y no inventes disponibilidad. ' +
  'Si no tienes informacion suficiente, dilo y sugiere una busqueda concreta en el catalogo. ' +
  `Usuario autenticado: ${user?.username || 'usuario'}.\n\n` +
  `Contexto actual del catalogo disponible:\n${catalogContext}`
);

const buildOpenAiMessages = ({ systemPrompt, history, message }) => [
  { role: 'system', content: systemPrompt },
  ...normalizeHistory(history),
  { role: 'user', content: message }
];

async function askGemini({ systemPrompt, history, message }) {
  const contents = [
    ...normalizeHistory(history),
    { role: 'user', content: message }
  ].map((item) => ({
    role: item.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: item.content }]
  }));

  const models = Array.from(new Set([
    config.ai.geminiModel,
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-flash-latest'
  ].filter(Boolean))).map((model) => model.replace(/^models\//, ''));

  let lastError = null;

  for (const model of models) {
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.ai.geminiApiKey}`,
        {
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          contents,
          generationConfig: {
            temperature: 0.45,
            maxOutputTokens: 550
          }
        },
        {
          timeout: AI_TIMEOUT,
          headers: { 'Content-Type': 'application/json' }
        }
      );

      return {
        provider: 'gemini',
        model,
        reply: response.data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      };
    } catch (error) {
      lastError = error;
      console.warn(`[Chatbot] Gemini model "${model}" failed: ${error.message}`);
    }
  }

  throw lastError || new Error('Gemini request failed');
}

async function askGroq({ systemPrompt, history, message }) {
  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: config.ai.groqModel,
      messages: buildOpenAiMessages({ systemPrompt, history, message }),
      temperature: 0.45,
      max_tokens: 550
    },
    {
      timeout: AI_TIMEOUT,
      headers: {
        Authorization: `Bearer ${config.ai.groqApiKey}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return {
    provider: 'groq',
    model: config.ai.groqModel,
    reply: response.data?.choices?.[0]?.message?.content || ''
  };
}

async function askOpenRouter({ systemPrompt, history, message }) {
  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: config.ai.openRouterModel,
      messages: buildOpenAiMessages({ systemPrompt, history, message }),
      temperature: 0.45,
      max_tokens: 550
    },
    {
      timeout: AI_TIMEOUT,
      headers: {
        Authorization: `Bearer ${config.ai.openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': config.ai.openRouterReferer,
        'X-Title': config.ai.openRouterTitle
      }
    }
  );

  return {
    provider: 'openrouter',
    model: config.ai.openRouterModel,
    reply: response.data?.choices?.[0]?.message?.content || ''
  };
}

const providerHandlers = {
  gemini: askGemini,
  groq: askGroq,
  openrouter: askOpenRouter
};

const fallbackAnswer = (message) => (
  'En este momento no pude conectarme con Gemini, Groq ni OpenRouter, pero sigo disponible con una respuesta local. ' +
  `Tu pregunta fue: "${trimText(message, 220)}". ` +
  'Para preguntas sobre libros, intenta buscar por titulo, autor o categoria en el catalogo; si necesitas una recomendacion, dime el tema, nivel y objetivo de estudio.'
);

export class ChatbotService {
  static async answer({ message, history, user, accessToken }) {
    const catalogContext = await CatalogContextService.getCatalogSnapshot(accessToken);
    const systemPrompt = buildSystemPrompt({ user, catalogContext });
    const providerOrder = getProviderOrder();

    for (const provider of providerOrder) {
      try {
        const result = await providerHandlers[provider]({ systemPrompt, history, message });
        if (result.reply && result.reply.trim().length > 0) {
          return {
            ...result,
            reply: result.reply.trim(),
            fallbackUsed: false
          };
        }
      } catch (error) {
        console.warn(`[Chatbot] ${provider} failed: ${error.message}`);
      }
    }

    return {
      provider: 'local-fallback',
      model: 'rule-based',
      reply: fallbackAnswer(message),
      fallbackUsed: true
    };
  }
}
