import { env } from '../config/env.js';

type MediaFila = {
  id: string;
  path: string;
  alt: string | null;
  orden: number;
  esPrincipal: boolean;
};

/**
 * En la base se guarda solo la ruta relativa ("foto.1.jpg"). La URL absoluta se
 * arma aqui, para que mover las fotos de servidor sea cambiar MEDIA_BASE_URL y no
 * 300 filas. El frontend SIEMPRE recibe URL absolutas y no concatena nada.
 */
export function urlDeMedia(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${env.MEDIA_BASE_URL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function presentarMedia(media: MediaFila) {
  return {
    id: media.id,
    url: urlDeMedia(media.path),
    alt: media.alt,
    orden: media.orden,
    esPrincipal: media.esPrincipal,
  };
}
