import axios from 'axios';
import { config } from '../config/env.js';

const CATALOG_TIMEOUT = 6000;

export class CatalogApiClient {
  constructor(baseURL) {
    this._client = axios.create({
      baseURL,
      timeout: CATALOG_TIMEOUT,
    });
  }

  setAccessToken(token) {
    this._token = token;
  }

  async getAvailableBooks(page = 1, limit = 12) {
    const response = await this._client.get('/api/catalog/books', {
      params: { page, limit, available: 'true' },
      headers: {
        Authorization: `Bearer ${this._token}`
      }
    });
    return response.data?.data || [];
  }
}

const compactBook = (book) => {
  const categories = Array.isArray(book.categories) ? book.categories.join(', ') : '';
  const description = book.description ? ` - ${String(book.description).replace(/\s+/g, ' ').slice(0, 180)}` : '';
  const availability = Number(book.availableCopies) > 0
    ? `${book.availableCopies} copias disponibles`
    : 'sin copias disponibles';

  return `${book.title} | ${book.author}${categories ? ` | ${categories}` : ''} | ${availability}${description}`;
};

export class CatalogContextService {
  constructor(catalogApiClient) {
    this._catalogApi = catalogApiClient;
  }

  async getCatalogSnapshot(accessToken) {
    if (!accessToken) return 'No se pudo consultar el catalogo autenticado.';

    this._catalogApi.setAccessToken(accessToken);

    try {
      const books = await this._catalogApi.getAvailableBooks();
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

export const catalogApiClient = new CatalogApiClient(config.catalogServiceUrl);
export const catalogContextService = new CatalogContextService(catalogApiClient);
