import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ErrorApi } from './api/cliente.ts';
import { App } from './App.tsx';
import './index.css';

const cliente = new QueryClient({
  defaultOptions: {
    queries: {
      // Un 4xx es una respuesta, no una falla de red: reintentarlo no cambia
      // nada y solo retrasa el mensaje de error.
      retry: (intentos, error) => !(error instanceof ErrorApi) && intentos < 2,
      staleTime: 30 * 1000,
    },
    mutations: {
      retry: false,
    },
  },
});

const raiz = document.getElementById('root');
if (!raiz) throw new Error('No existe el elemento #root');

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={cliente}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
