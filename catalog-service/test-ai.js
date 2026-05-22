import { AiService } from './src/services/ai.service.js';

const books = [
  {
    title: 'El gran libro de PostgreSQL',
    author: 'Juan Perez',
    categories: ['Base de Datos', 'SQL'],
    description: 'Una guia completa para aprender bases de datos y diseno de esquemas con Postgres.',
    availableCopies: 5
  },
  {
    title: 'El Quijote',
    author: 'Miguel de Cervantes',
    categories: ['Literatura', 'Clasico'],
    description: 'Las aventuras del ingenioso hidalgo Don Quijote de la Mancha.',
    availableCopies: 2
  },
  {
    title: 'Desarrollo web avanzado con React',
    author: 'Ana Lopez',
    categories: ['Web', 'React'],
    description: 'Aprende a construir aplicaciones frontend interactivas con React 19 y hooks modernos.',
    availableCopies: 4
  }
];

async function runTest() {
  console.log('--- Testing AiService.recommendBooks ---');
  console.log('Sending query: "Quiero aprender a disenar bases de datos relacionales"');

  const result = await AiService.recommendBooks({
    interest: 'Quiero aprender a disenar bases de datos relacionales',
    books: books
  });

  console.log('Result:', JSON.stringify(result, null, 2));
}

runTest();
