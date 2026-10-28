import { urlApi } from '../api/cliente.ts';

/**
 * La descarga va como enlace normal, no por fetch: el navegador manda la cookie
 * de sesion sola y el backend responde con Content-Disposition: attachment, asi
 * que se descarga sin sacar a nadie de la pagina. Funciona tambien con la API en
 * otro dominio porque la cookie va con SameSite=None.
 */
export function BotonExportar({ ruta }: { ruta: string }) {
  const separador = ruta.includes('?') ? '&' : '?';

  return (
    <a
      href={urlApi(`${ruta}${separador}formato=csv`)}
      className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      Exportar a Excel
    </a>
  );
}
