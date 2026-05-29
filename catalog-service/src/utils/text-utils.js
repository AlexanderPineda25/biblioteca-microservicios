export const trimText = (value, maxLength = 1200) => {
  if (!value) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, maxLength);
};

export const STOP_WORDS = new Set([
  'con', 'del', 'los', 'las', 'una', 'uno', 'unos', 'unas', 'para', 'por',
  'que', 'sobre', 'libro', 'libros', 'quiero', 'busco', 'buscar', 'me',
  'interesa', 'interesan', 'recomienda', 'recomiendas', 'algo', 'the', 'and',
  'for', 'with', 'book', 'books'
]);

export const normalizeText = (value) => trimText(value, 5000)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

export const tokenize = (value) => normalizeText(value)
  .split(/[^a-z0-9]+/i)
  .map((word) => word.trim())
  .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

export const buildBookLabel = (book) => {
  const categories = Array.isArray(book.categories) ? book.categories.join(', ') : '';
  return `${book.title} por ${book.author}${categories ? ` (${categories})` : ''}`;
};
