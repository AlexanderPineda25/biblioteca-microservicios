import { buildBookLabel, normalizeText, tokenize } from '../../utils/text-utils.js';

export class LocalFallbackProvider {
  constructor() {
    this.name = 'huggingface (local-fallback-simulated)';
  }

  recommend({ interest, books }) {
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
  }
}
