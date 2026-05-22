import axios from 'axios';
import { config } from '../config/env.js';

const CATALOG_TIMEOUT = 6000;

const compactBook = (book) => {
  const categories = Array.isArray(book.categories) ? book.categories.join(', ') : '';
  const description = book.description ? ` - ${String(book.description).replace(/\s+/g, ' ').slice(0, 180)}` : '';
  const availability = Number(book.availableCopies) > 0
    ? `${book.availableCopies} copias disponibles`
    : 'sin copias disponibles';

  return `${book.title} | ${book.author}${categories ? ` | ${categories}` : ''} | ${availability}${description}`;
};

export class CatalogContextService {
  static async getCatalogSnapshot(accessToken) {
    if (!accessToken) return 'No se pudo consultar el catalogo autenticado.';

    try {
      const response = await axios.get(
        `${config.catalogServiceUrl}/api/catalog/books?page=1&limit=12&available=true`,
        {
          timeout: CATALOG_TIMEOUT,
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );

      const books = response.data?.data || [];
      if (!books.length) {
        return 'El catalogo no tiene libros disponibles en este momento.';
      }

      return books.map(compactBook).join('\n');
    } catch (error) {
      console.warn(`[Chatbot] Catalog context unavailable: ${error.message}`);
      return 'El contexto del catalogo no estuvo disponible para esta respuesta.';
    }
  }
}
