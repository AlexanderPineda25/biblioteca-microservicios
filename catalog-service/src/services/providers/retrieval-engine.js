import { tokenize } from '../../utils/text-utils.js';

const shareCommonPrefix = (tokenA, tokenB) => {
  const minLen = Math.min(tokenA.length, tokenB.length);
  if (minLen < 4) return tokenA === tokenB;
  return tokenA.slice(0, 4) === tokenB.slice(0, 4);
};

export class RetrievalEngine {
  getRetrievalScore(book, interestTokens) {
    if (interestTokens.length === 0) return 0;
    const categories = Array.isArray(book.categories) ? book.categories : [];
    const titleTokens = tokenize(book.title);
    const authorTokens = tokenize(book.author);
    const categoryTokens = tokenize(categories.join(' '));
    const descriptionTokens = tokenize(book.description || '');

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
  }

  retrieve(interest, books) {
    const interestTokens = tokenize(interest);
    return books.map((book) => {
      const retrievalScore = this.getRetrievalScore(book, interestTokens);
      return { book, retrievalScore };
    });
  }
}
