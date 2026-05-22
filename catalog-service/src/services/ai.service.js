import axios from 'axios';
import { config } from '../config/env.js';

// ─── Text utilities ─────────────────────────────────────────────────────────

const trimText = (value, maxLength = 1200) => {
  if (!value) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, maxLength);
};

const MAX_CANDIDATE_BOOKS = 50;
const MAX_RECOMMENDATIONS = 5;

const STOP_WORDS = new Set([
  'con', 'del', 'los', 'las', 'una', 'uno', 'unos', 'unas', 'para', 'por',
  'que', 'sobre', 'libro', 'libros', 'quiero', 'busco', 'buscar', 'me',
  'interesa', 'interesan', 'recomienda', 'recomiendas', 'algo', 'the', 'and',
  'for', 'with', 'book', 'books'
]);

const normalizeText = (value) => trimText(value, 5000)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const tokenize = (value) => normalizeText(value)
  .split(/[^a-z0-9]+/i)
  .map((word) => word.trim())
  .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

const buildBookLabel = (book) => {
  const categories = Array.isArray(book.categories) ? book.categories.join(', ') : '';
  return `${book.title} por ${book.author}${categories ? ` (${categories})` : ''}`;
};

// ─── Hugging Face parser ─────────────────────────────────────────────────────

const parseHuggingFaceResponse = (data) => {
  if (data?.error) {
    throw new Error(data.error);
  }

  // New Inference Router format: flat array of {label, score}
  if (Array.isArray(data) && data.every((item) => item?.label && typeof item.score === 'number')) {
    return data.map((item) => ({ label: item.label, score: item.score }));
  }

  // Legacy format: [{labels: [], scores: []}]
  const payload = Array.isArray(data) ? data[0] : data;
  if (Array.isArray(payload?.labels) && Array.isArray(payload?.scores)) {
    return payload.labels.map((label, index) => ({
      label,
      score: payload.scores[index]
    }));
  }

  return [];
};

// ─── Local semantic fallback ─────────────────────────────────────────────────

const getLocalSemanticRecommendations = ({ interest, books }) => {
  const interestTokens = tokenize(interest);
  const interestTokenSet = new Set(interestTokens);
  const normalizedInterest = normalizeText(interest);

  const scoredBooks = books.map((book) => {
    const categories = Array.isArray(book.categories) ? book.categories : [];
    const titleTokens = tokenize(book.title);
    const authorTokens = tokenize(book.author);
    const categoryTokens = tokenize(categories.join(' '));
    const descriptionTokens = tokenize(book.description || '');
    const searchableTokens = new Set([
      ...titleTokens,
      ...authorTokens,
      ...categoryTokens,
      ...descriptionTokens
    ]);

    const keywordMatches = interestTokens.filter((t) => searchableTokens.has(t)).length;
    const titleMatches = interestTokens.filter((t) => titleTokens.includes(t)).length;
    const categoryMatches = categoryTokens
      .filter((t) => interestTokenSet.has(t) || normalizedInterest.includes(t)).length;
    const authorMatches = interestTokens.filter((t) => authorTokens.includes(t)).length;
    const descriptionMatches = interestTokens.filter((t) => descriptionTokens.includes(t)).length;

    const weightedScore =
      (keywordMatches * 0.14) +
      (titleMatches * 0.2) +
      (categoryMatches * 0.24) +
      (authorMatches * 0.12) +
      (descriptionMatches * 0.08);

    const score = Math.max(0.22, Math.min(0.96, 0.38 + weightedScore));

    return { book, label: buildBookLabel(book), score };
  });

  return scoredBooks.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.book.title).localeCompare(String(b.book.title));
  });
};

// ─── Chat AI helpers (Gemini / Groq / OpenRouter) ────────────────────────────

async function generateChatExplanation(interest, topBooks) {
  const { chatProvider, geminiApiKey, geminiModel, groqApiKey, openRouterApiKey } = config.ai;

  const bookList = topBooks
    .map((b, i) => `${i + 1}. "${b.title}" por ${b.author}${b.description ? ` – ${trimText(b.description, 120)}` : ''}`)
    .join('\n');

  const prompt =
    `El usuario busca libros sobre: "${interest}".\n` +
    `El sistema de IA ha seleccionado los siguientes libros para él:\n${bookList}\n\n` +
    `Escribe un párrafo amigable y entusiasta en español (máximo 5 oraciones) que explique por qué ` +
    `estos libros son perfectos para el usuario. Menciona los títulos de forma natural. ` +
    `No uses listas, escribe en prosa fluida.`;

  // --- Gemini ---------------------------------------------------------------
  const tryGemini = async () => {
    const key = geminiApiKey;
    if (!key) return null;
    console.log('[AI Service] Generating conversational explanation with Google Gemini...');
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${key}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
    );
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  };

  // --- Groq -----------------------------------------------------------------
  const tryGroq = async () => {
    const key = groqApiKey;
    if (!key) return null;
    console.log('[AI Service] Generating conversational explanation with Groq Cloud...');
    const res = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300
      },
      { timeout: 15000, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } }
    );
    return res.data?.choices?.[0]?.message?.content || null;
  };

  // --- OpenRouter -----------------------------------------------------------
  const tryOpenRouter = async () => {
    const key = openRouterApiKey;
    if (!key) return null;
    console.log('[AI Service] Generating conversational explanation with OpenRouter...');
    const res = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'mistralai/mistral-7b-instruct:free',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300
      },
      {
        timeout: 15000,
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3002',
          'X-Title': 'Biblioteca Universitaria'
        }
      }
    );
    return res.data?.choices?.[0]?.message?.content || null;
  };

  // Provider priority: explicit config > key presence
  const orderedProviders = [];
  if (chatProvider === 'gemini') orderedProviders.push(tryGemini, tryGroq, tryOpenRouter);
  else if (chatProvider === 'groq') orderedProviders.push(tryGroq, tryGemini, tryOpenRouter);
  else if (chatProvider === 'openrouter') orderedProviders.push(tryOpenRouter, tryGemini, tryGroq);
  else orderedProviders.push(tryGemini, tryGroq, tryOpenRouter);

  for (const tryProvider of orderedProviders) {
    try {
      const text = await tryProvider();
      if (text && text.trim().length > 10) return text.trim();
    } catch (err) {
      console.warn(`[AI Service] Chat provider failed: ${err.message}`);
    }
  }

  return null;
}

// ─── Main AiService class ────────────────────────────────────────────────────

const shareCommonPrefix = (tokenA, tokenB) => {
  const minLen = Math.min(tokenA.length, tokenB.length);
  // Require both tokens to be at least 4 characters for prefix matching
  // Short tokens (< 4 chars) must be an exact match to prevent noise
  if (minLen < 4) return tokenA === tokenB;
  return tokenA.slice(0, 4) === tokenB.slice(0, 4);
};

const getRetrievalScore = (book, interestTokens) => {
  if (interestTokens.length === 0) return 0;
  const categories = Array.isArray(book.categories) ? book.categories : [];
  const titleTokens = tokenize(book.title);
  const authorTokens = tokenize(book.author);
  const categoryTokens = tokenize(categories.join(' '));
  const descriptionTokens = tokenize(book.description || '');

  // Filter out very short tokens (< 3 chars) from book metadata to prevent garbage matches
  const filterShort = (tokens) => tokens.filter((t) => t.length >= 3);
  const filteredTitle = filterShort(titleTokens);
  const filteredAuthor = filterShort(authorTokens);
  const filteredCategory = filterShort(categoryTokens);
  const filteredDescription = filterShort(descriptionTokens);

  const searchableTokens = [
    ...filteredTitle,
    ...filteredAuthor,
    ...filteredCategory,
    ...filteredDescription
  ];

  let score = 0;
  for (const interestToken of interestTokens) {
    // Skip very short interest tokens too
    if (interestToken.length < 3) continue;
    for (const bookToken of searchableTokens) {
      if (shareCommonPrefix(interestToken, bookToken)) {
        const inTitle = filteredTitle.includes(bookToken);
        const inCategory = filteredCategory.includes(bookToken);
        const inAuthor = filteredAuthor.includes(bookToken);

        if (inTitle) score += 3.0;
        else if (inCategory) score += 2.5;
        else if (inAuthor) score += 1.5;
        else score += 1.0;
      }
    }
  }

  return score;
};

export class AiService {
  static async recommendBooks({ interest, books }) {
    const availableBooks = books
      .filter((book) => Number(book.availableCopies) > 0);

    if (availableBooks.length === 0) {
      return {
        provider: config.ai.provider,
        model: config.ai.huggingFaceModel,
        recommendation: 'No hay libros disponibles para recomendar en este momento.'
      };
    }

    // Stage 1: Retrieval (Filter & pre-rank candidates to eliminate irrelevant garbage like "aaaaaaa" and "gato")
    const interestTokens = tokenize(interest);
    const scoredBooks = availableBooks.map((book) => {
      const retrievalScore = getRetrievalScore(book, interestTokens);
      return { book, retrievalScore };
    });

    // Sort by retrieval score descending
    scoredBooks.sort((a, b) => b.retrievalScore - a.retrievalScore);

    // If absolutely no matching books are found, return a friendly message suggesting correct search keywords
    if (scoredBooks.length === 0 || scoredBooks[0].retrievalScore === 0) {
      return {
        provider: 'huggingface (local-retrieval-simulated)',
        model: config.ai.huggingFaceModel,
        externalAiService: 'Hugging Face Inference API',
        externalAiServiceUsed: false,
        rankingStrategy: 'local-retrieval-no-matches',
        chatAiUsed: false,
        chatAiProvider: null,
        recommendation: 'Lo siento, no he podido encontrar libros relacionados con tu búsqueda en nuestro catálogo actual. Te sugiero intentar buscando conceptos como "programación", "bases de datos", "Clean Code", "React", "Refactoring" o "DevOps".'
      };
    }

    const candidatePairs = scoredBooks.filter(p => p.retrievalScore > 0).slice(0, 10);
    const candidateBooks = candidatePairs.map(p => p.book);
    const candidateLabels = candidateBooks.map(buildBookLabel);

    let fallbackUsed = false;
    let externalAiServiceUsed = false;
    let chatUsed = false;
    let chatProvider = '';
    let providerName = config.ai.provider;
    let modelName = config.ai.huggingFaceModel;

    let labels = [];
    let scores = [];

    // ── Step 1: Hugging Face zero-shot classification ──────────────────────
    if (!config.ai.huggingFaceApiToken) {
      console.warn('[AI Service] HF_API_TOKEN is missing. Using local fallback.');
      fallbackUsed = true;
    } else {
      try {
        console.log(`[AI Service] Sending zero-shot request to Hugging Face: ${config.ai.huggingFaceModel}`);
        const response = await axios.post(
          `https://router.huggingface.co/hf-inference/models/${config.ai.huggingFaceModel}`,
          {
            inputs: trimText(interest, 300),
            parameters: { 
              candidate_labels: candidateLabels, 
              multi_label: false,
              hypothesis_template: "Este libro trata sobre {}."
            }
          },
          {
            timeout: 15000,
            headers: {
              Authorization: `Bearer ${config.ai.huggingFaceApiToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        console.log(`[AI Service] Hugging Face response received. Status: ${response.status}`);

        const parsed = parseHuggingFaceResponse(response.data);
        console.log(`[AI Service] Parsed ${parsed.length} labels from Hugging Face.`);

        if (parsed.length > 0) {
          // Sort by descending HF score (highest relevance first)
          const sorted = [...parsed].sort((a, b) => b.score - a.score);
          labels = sorted.map((r) => r.label);
          scores = sorted.map((r) => r.score);
          externalAiServiceUsed = true;
          console.log(`[AI Service] Using 100% Hugging Face scores. Top: "${labels[0]}" (${(scores[0] * 100).toFixed(1)}%)`);
        } else {
          console.warn('[AI Service] Hugging Face returned empty payload. Using local fallback.');
          fallbackUsed = true;
        }
      } catch (err) {
        console.warn(`[AI Service] Hugging Face request failed (${err.message}). Using local fallback.`);
        fallbackUsed = true;
      }
    }

    // ── Step 2: Local fallback (only when HF is unavailable) ──────────────
    if (fallbackUsed) {
      providerName = 'huggingface (local-fallback-simulated)';
      modelName = `${config.ai.huggingFaceModel} (Simulado)`;
      console.log('[AI Service] Executing local semantic fallback matching.');

      const localScored = getLocalSemanticRecommendations({ interest, books: candidateBooks });
      labels = localScored.map((sb) => sb.label);
      scores = localScored.map((sb) => sb.score);
    }

    // ── Step 3: Build top N recommendations ───────────────────────────────
    const topRecommendations = labels.slice(0, MAX_RECOMMENDATIONS).map((label, index) => {
      const bookIndex = candidateLabels.indexOf(label);
      const book = candidateBooks[bookIndex];
      const scoreDisplay = typeof scores[index] === 'number'
        ? `${(scores[index] * 100).toFixed(1)}%`
        : 'afinidad alta';

      if (!book) return { label, scoreDisplay, description: '' };
      return { book, label, scoreDisplay, description: trimText(book.description, 180) };
    });

    // ── Step 4: Conversational explanation via Gemini / Groq / OpenRouter ──
    let explanation = null;
    const topBooksForChat = topRecommendations
      .filter((r) => r.book)
      .map((r) => ({ title: r.book.title, author: r.book.author, description: r.book.description }));

    if (topBooksForChat.length > 0) {
      try {
        const chatText = await generateChatExplanation(interest, topBooksForChat);
        if (chatText) {
          explanation = chatText;
          chatUsed = true;

          // Identify which provider replied
          const { chatProvider: cp, geminiApiKey, groqApiKey, openRouterApiKey } = config.ai;
          if (cp) chatProvider = cp;
          else if (geminiApiKey) chatProvider = 'gemini';
          else if (groqApiKey) chatProvider = 'groq';
          else if (openRouterApiKey) chatProvider = 'openrouter';

          console.log(`[AI Service] Conversational explanation generated via ${chatProvider}.`);
        }
      } catch (chatErr) {
        console.warn(`[AI Service] Chat generation skipped: ${chatErr.message}`);
      }
    }

    // ── Step 5: Build recommendation text ─────────────────────────────────
    const bulletList = topRecommendations.map((r) => {
      if (!r.book) return `- ${r.label}: afinidad ${r.scoreDisplay} con tu búsqueda.`;
      return `- ${r.book.title}, de ${r.book.author}: afinidad ${r.scoreDisplay}. ${r.description}`;
    });

    const recommendationText = explanation
      ? `${explanation}\n\n---\nListado de recomendaciones:\n${bulletList.join('\n')}`
      : `Recomendaciones generadas con IA (zero-shot classification):\n${bulletList.join('\n')}`;

    return {
      provider: providerName,
      model: modelName,
      externalAiService: 'Hugging Face Inference API',
      externalAiServiceUsed: externalAiServiceUsed && !fallbackUsed,
      rankingStrategy: externalAiServiceUsed && !fallbackUsed
        ? 'huggingface-zero-shot-100pct'
        : 'local-semantic-fallback',
      chatAiUsed: chatUsed,
      chatAiProvider: chatUsed ? chatProvider : null,
      recommendation: recommendationText
    };
  }
}
