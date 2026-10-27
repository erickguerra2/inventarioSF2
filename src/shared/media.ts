import { env } from '../config/env.js';

type MediaFila = {
  id: string;
  path: string;
  alt: string | null;
  orden: number;
  esPrincipal: boolean;
};

/**
 * En la base se guarda solo el nombre del archivo ("foto.1.jpg"). La URL absoluta
 * se arma aqui, para que mover las fotos de servidor sea cambiar MEDIA_BASE_URL y
 * no 300 filas. El frontend SIEMPRE recibe URL absolutas y no concatena nada.
 *
 * Cada foto existe en dos tamanos, generados una sola vez:
 *
 *   uniformes/<archivo>        ancho 800, ~70 KB — para ver la prenda
 *   uniformes/mini/<archivo>   ancho 200, ~7 KB  — para listas y resultados
 *
 * Los originales venian de hasta 6144x8192 y 2.7 MB cada uno. Servir eso para
 * pintar una miniatura, sobre el WiFi del colegio y con alguien esperando en la
 * ventanilla, es la diferencia entre instantaneo e inusable.
 */
function urlDeArchivo(carpeta: string, archivo: string): string {
  return `${env.MEDIA_BASE_URL.replace(/\/+$/, '')}/${carpeta}/${archivo.replace(/^\/+/, '')}`;
}

export function urlDeMedia(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return urlDeArchivo('uniformes', path);
}

export function presentarMedia(media: MediaFila) {
  const esExterna = /^https?:\/\//i.test(media.path);

  return {
    id: media.id,
    url: urlDeMedia(media.path),
    /** La miniatura. Si la foto es una URL externa, no hay version chica. */
    urlMini: esExterna ? media.path : urlDeArchivo('uniformes/mini', media.path),
    alt: media.alt,
    orden: media.orden,
    esPrincipal: media.esPrincipal,
  };
}
