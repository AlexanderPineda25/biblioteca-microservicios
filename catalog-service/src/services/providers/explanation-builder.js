import axios from 'axios';
import { config } from '../../config/env.js';
import { trimText } from '../../utils/text-utils.js';

export class ExplanationBuilder {
  constructor() {
    this.chatProvider = config.ai.chatProvider;
    this.geminiApiKey = config.ai.geminiApiKey;
    this.groqApiKey = config.ai.groqApiKey;
    this.openRouterApiKey = config.ai.openRouterApiKey;
    this.geminiModel = config.ai.geminiModel;
  }

  async generate({ interest, topBooks }) {
    const bookList = topBooks
      .map((b, i) => `${i + 1}. "${b.title}" por ${b.author}${b.description ? ` – ${trimText(b.description, 120)}` : ''}`)
      .join('\n');

    const prompt =
      `El usuario busca libros sobre: "${interest}".\n` +
      `El sistema de IA ha seleccionado los siguientes libros para él:\n${bookList}\n\n` +
      `Escribe un párrafo amigable y entusiasta en español (máximo 5 oraciones) que explique por qué ` +
      `estos libros son perfectos para el usuario. Menciona los títulos de forma natural. ` +
      `No uses listas, escribe en prosa fluida.`;

    const providers = [];
    if (this.chatProvider === 'gemini') providers.push(this.tryGemini.bind(this), this.tryGroq.bind(this), this.tryOpenRouter.bind(this));
    else if (this.chatProvider === 'groq') providers.push(this.tryGroq.bind(this), this.tryGemini.bind(this), this.tryOpenRouter.bind(this));
    else if (this.chatProvider === 'openrouter') providers.push(this.tryOpenRouter.bind(this), this.tryGemini.bind(this), this.tryGroq.bind(this));
    else providers.push(this.tryGemini.bind(this), this.tryGroq.bind(this), this.tryOpenRouter.bind(this));

    for (const tryProvider of providers) {
      try {
        const text = await tryProvider(prompt);
        if (text && text.trim().length > 10) return { text: text.trim(), provider: this._identifyProvider(tryProvider) };
      } catch (err) {
        console.warn(`[ExplanationBuilder] Chat provider failed: ${err.message}`);
      }
    }

    return null;
  }

  async tryGemini(prompt) {
    if (!this.geminiApiKey) return null;
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${this.geminiApiKey}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
    );
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  }

  async tryGroq(prompt) {
    if (!this.groqApiKey) return null;
    const res = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      { model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: prompt }], max_tokens: 300 },
      { timeout: 15000, headers: { Authorization: `Bearer ${this.groqApiKey}`, 'Content-Type': 'application/json' } }
    );
    return res.data?.choices?.[0]?.message?.content || null;
  }

  async tryOpenRouter(prompt) {
    if (!this.openRouterApiKey) return null;
    const res = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      { model: 'mistralai/mistral-7b-instruct:free', messages: [{ role: 'user', content: prompt }], max_tokens: 300 },
      {
        timeout: 15000,
        headers: {
          Authorization: `Bearer ${this.openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3002',
          'X-Title': 'Biblioteca Universitaria'
        }
      }
    );
    return res.data?.choices?.[0]?.message?.content || null;
  }

  _identifyProvider(fn) {
    if (fn === this.tryGemini) return 'gemini';
    if (fn === this.tryGroq) return 'groq';
    if (fn === this.tryOpenRouter) return 'openrouter';
    return 'unknown';
  }
}
