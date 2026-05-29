import { config } from '../config/env.js';
import { buildBookLabel, trimText, tokenize } from '../utils/text-utils.js';
import { RetrievalEngine } from './providers/retrieval-engine.js';
import { HuggingFaceProvider } from './providers/huggingface-provider.js';
import { LocalFallbackProvider } from './providers/local-fallback-provider.js';
import { ExplanationBuilder } from './providers/explanation-builder.js';

const MAX_CANDIDATE_BOOKS = 50;
const MAX_RECOMMENDATIONS = 5;

export class AiService {
  constructor() {
    this.retrievalEngine = new RetrievalEngine();
    this.huggingFaceProvider = new HuggingFaceProvider();
    this.localFallbackProvider = new LocalFallbackProvider();
    this.explanationBuilder = new ExplanationBuilder();
  }

  async recommendBooks({ interest, books }) {
    const availableBooks = books
      .filter((book) => Number(book.availableCopies) > 0);

    if (availableBooks.length === 0) {
      return {
        provider: config.ai.provider,
        model: config.ai.huggingFaceModel,
        recommendation: 'No hay libros disponibles para recomendar en este momento.'
      };
    }

    const interestTokens = tokenize(interest);
    const scoredBooks = this.retrievalEngine.retrieve(interest, availableBooks);

    scoredBooks.sort((a, b) => b.retrievalScore - a.retrievalScore);

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

    const candidatePairs = scoredBooks.filter(p => p.retrievalScore > 0).slice(0, MAX_CANDIDATE_BOOKS);
    const candidateBooks = candidatePairs.map(p => p.book);
    const candidateLabels = candidateBooks.map(buildBookLabel);

    let fallbackUsed = false;
    let externalAiServiceUsed = false;
    let providerName = config.ai.provider;
    let modelName = config.ai.huggingFaceModel;
    let labels = [];
    let scores = [];

    if (!this.huggingFaceProvider.isAvailable) {
      console.warn('[AI Service] HF_API_TOKEN is missing. Using local fallback.');
      fallbackUsed = true;
    } else {
      try {
        const hfResult = await this.huggingFaceProvider.rank({ interest, candidateLabels });
        labels = hfResult.labels;
        scores = hfResult.scores;
        externalAiServiceUsed = true;
      } catch (err) {
        console.warn(`[AI Service] Hugging Face request failed (${err.message}). Using local fallback.`);
        fallbackUsed = true;
      }
    }

    if (fallbackUsed) {
      providerName = 'huggingface (local-fallback-simulated)';
      modelName = `${config.ai.huggingFaceModel} (Simulado)`;
      const localScored = this.localFallbackProvider.recommend({ interest, books: candidateBooks });
      labels = localScored.map((sb) => sb.label);
      scores = localScored.map((sb) => sb.score);
    }

    const topRecommendations = labels.slice(0, MAX_RECOMMENDATIONS).map((label, index) => {
      const bookIndex = candidateLabels.indexOf(label);
      const book = candidateBooks[bookIndex];
      const scoreDisplay = typeof scores[index] === 'number'
        ? `${(scores[index] * 100).toFixed(1)}%`
        : 'afinidad alta';

      if (!book) return { label, scoreDisplay, description: '' };
      return { book, label, scoreDisplay, description: trimText(book.description, 180) };
    });

    let explanation = null;
    let chatUsed = false;
    let chatProvider = '';

    const topBooksForChat = topRecommendations
      .filter((r) => r.book)
      .map((r) => ({ title: r.book.title, author: r.book.author, description: r.book.description }));

    if (topBooksForChat.length > 0) {
      try {
        const result = await this.explanationBuilder.generate({ interest, topBooks: topBooksForChat });
        if (result) {
          explanation = result.text;
          chatUsed = true;
          chatProvider = result.provider;
        }
      } catch (chatErr) {
        console.warn(`[AI Service] Chat generation skipped: ${chatErr.message}`);
      }
    }

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
