import { z } from 'zod';

export const paginacionSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export type Paginacion = z.infer<typeof paginacionSchema>;

export type RespuestaPaginada<T> = {
  data: T[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
};

export function paginar<T>(data: T[], total: number, { page, perPage }: Paginacion): RespuestaPaginada<T> {
  return {
    data,
    meta: {
      page,
      perPage,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / perPage),
    },
  };
}

export function saltar({ page, perPage }: Paginacion): { skip: number; take: number } {
  return { skip: (page - 1) * perPage, take: perPage };
}
