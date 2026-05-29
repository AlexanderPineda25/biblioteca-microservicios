import axios from 'axios';
import { config } from '../../config/env.js';

const AI_TIMEOUT = 20000;

const trimText = (value, maxLength = 4000) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maxLength);

const normalizeHistory = (history = []) => history
  .filter((item) => ['user', 'assistant'].includes(item.role) && item.content)
  .slice(-8)
  .map((item) => ({
    role: item.role,
    content: trimText(item.content, 1200)
  }));

const buildOpenAiMessages = ({ systemPrompt, history, message }) => [
  { role: 'system', content: systemPrompt },
  ...normalizeHistory(history),
  { role: 'user', content: message }
];

export class GeminiProvider {
  constructor() {
    this.name = 'gemini';
    this.enabled = Boolean(config.ai.geminiApiKey);
    this.apiKey = config.ai.geminiApiKey;
    this.models = Array.from(new Set([
      config.ai.geminiModel,
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-flash-latest'
    ].filter(Boolean))).map((model) => model.replace(/^models\//, ''));
  }

  async ask({ systemPrompt, history, message }) {
    const contents = [
      ...normalizeHistory(history),
      { role: 'user', content: message }
    ].map((item) => ({
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: item.content }]
    }));

    let lastError = null;

    for (const model of this.models) {
      try {
        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
          {
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: { temperature: 0.45, maxOutputTokens: 550 }
          },
          { timeout: AI_TIMEOUT, headers: { 'Content-Type': 'application/json' } }
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
}

export class GroqProvider {
  constructor() {
    this.name = 'groq';
    this.enabled = Boolean(config.ai.groqApiKey);
    this.apiKey = config.ai.groqApiKey;
    this.model = config.ai.groqModel;
  }

  async ask({ systemPrompt, history, message }) {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: this.model,
        messages: buildOpenAiMessages({ systemPrompt, history, message }),
        temperature: 0.45,
        max_tokens: 550
      },
      {
        timeout: AI_TIMEOUT,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      provider: 'groq',
      model: this.model,
      reply: response.data?.choices?.[0]?.message?.content || ''
    };
  }
}

export class OpenRouterProvider {
  constructor() {
    this.name = 'openrouter';
    this.enabled = Boolean(config.ai.openRouterApiKey);
    this.apiKey = config.ai.openRouterApiKey;
    this.model = config.ai.openRouterModel;
  }

  async ask({ systemPrompt, history, message }) {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: this.model,
        messages: buildOpenAiMessages({ systemPrompt, history, message }),
        temperature: 0.45,
        max_tokens: 550
      },
      {
        timeout: AI_TIMEOUT,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': config.ai.openRouterReferer,
          'X-Title': config.ai.openRouterTitle
        }
      }
    );

    return {
      provider: 'openrouter',
      model: this.model,
      reply: response.data?.choices?.[0]?.message?.content || ''
    };
  }
}
