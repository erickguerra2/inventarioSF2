/**
 * Datos iniciales, tomados de uniformes-ccsf2.md.
 *
 * Es idempotente: se puede correr varias veces sin duplicar nada y SIN pisar
 * precios o existencias que ya se hayan ajustado a mano. Las existencias entran
 * como movimientos APERTURA, nunca escribiendo stockActual directo.
 *
 *   npm run seed
 */
import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { registrarMovimiento } from '../src/modules/inventario/inventario.service.js';
import { normalizarTalla, ordenDeTalla } from '../src/modules/uniformes/tallas.js';
import { prisma } from '../src/shared/prisma.js';
import { skuBolsa, skuVariante } from '../src/shared/sku.js';

// ===========================================================================
// ATENCION: PRECIOS DE EJEMPLO.
//
// uniformes-ccsf2.md dice que en el sitio anterior TODAS las tallas tenian
// Q1.00 y 0 existencias, que eran valores de prueba, y que hay que definir los
// reales. Los de abajo son inventados, solo para poder probar la aplicacion con
// numeros que se distingan entre si. La administradora los corrige desde
// PATCH /api/v1/uniformes/variantes/:id antes de usar el sistema de verdad.
// ===========================================================================
const Q = (quetzales: number) => Math.round(quetzales * 100);

type TallaDef = { talla: string; precioCentavos: number; stockInicial: number };

const tallasLetra = (
  precio: number,
  stock: Partial<Record<string, number>> = {},
): TallaDef[] =>
  ['XS', 'S', 'M', 'L', 'XL'].map((talla) => ({
    talla,
    precioCentavos: Q(precio),
    stockInicial: stock[talla] ?? 0,
  }));

type PrendaDef = {
  nombre: string;
  descripcion: string;
  tipoTalla: 'LETRA' | 'NUMERO';
  stockMinimo: number;
  tallas: TallaDef[];
  /**
   * Nombres de archivo del sitio anterior. En uniformes-ccsf2.md las fotos del
   * uniforme de fisica aparecen como numeros sueltos ("15, 16, 17...") y las de
   * diario como "foto.1.jpg", asi que aqui se asume el mismo patron foto.N.jpg
   * para todas. Si en el servidor se llaman distinto, se corrige aqui.
   */
  fotos: string[];
};

const CATALOGO: Array<{
  codigo: 'DIARIO' | 'FISICA';
  nombre: string;
  orden: number;
  prendas: PrendaDef[];
}> = [
  {
    codigo: 'DIARIO',
    nombre: 'Uniforme de diario',
    orden: 1,
    prendas: [
      {
        nombre: 'Polo institucional',
        descripcion: 'Polo del uniforme de diario, con logo bordado.',
        tipoTalla: 'LETRA',
        stockMinimo: 5,
        tallas: tallasLetra(85, { XS: 8, S: 14, M: 20, L: 11, XL: 0 }),
        fotos: ['foto.1.jpg', 'foto.3.jpg', 'foto.5.jpg'],
      },
      {
        nombre: 'Pantalón formal',
        descripcion: 'Pantalón formal del uniforme de diario.',
        tipoTalla: 'NUMERO',
        stockMinimo: 4,
        // Las tallas grandes cuestan un poco mas: cada talla tiene su propio precio.
        tallas: [
          { talla: '28', precioCentavos: Q(145), stockInicial: 6 },
          { talla: '30', precioCentavos: Q(145), stockInicial: 9 },
          { talla: '32', precioCentavos: Q(145), stockInicial: 12 },
          { talla: '34', precioCentavos: Q(155), stockInicial: 7 },
          { talla: '36', precioCentavos: Q(155), stockInicial: 3 },
          { talla: '38', precioCentavos: Q(165), stockInicial: 0 },
        ],
        fotos: ['foto.1.jpg', 'foto.2.jpg', 'foto.4.jpg'],
      },
      {
        nombre: 'Chumpa institucional',
        descripcion: 'Chumpa del uniforme de diario.',
        tipoTalla: 'LETRA',
        stockMinimo: 3,
        tallas: tallasLetra(225, { XS: 4, S: 7, M: 9, L: 5, XL: 2 }),
        fotos: ['foto.2.jpg', 'foto.4.jpg', 'foto.6.jpg'],
      },
    ],
  },
  {
    codigo: 'FISICA',
    nombre: 'Uniforme de educación física',
    orden: 2,
    prendas: [
      {
        nombre: 'Camisa deportiva',
        descripcion: 'Camisa del uniforme de educación física.',
        tipoTalla: 'LETRA',
        stockMinimo: 5,
        tallas: tallasLetra(75, { XS: 10, S: 16, M: 18, L: 9, XL: 3 }),
        fotos: ['foto.15.jpg', 'foto.16.jpg', 'foto.17.jpg'],
      },
      {
        nombre: 'Pants deportivo',
        descripcion: 'Pants del uniforme de educación física.',
        tipoTalla: 'LETRA',
        stockMinimo: 5,
        tallas: tallasLetra(135, { XS: 7, S: 12, M: 15, L: 8, XL: 1 }),
        fotos: ['foto.15.jpg', 'foto.22.jpg', 'foto.23.jpg'],
      },
      {
        nombre: 'Chumpa deportiva',
        descripcion: 'Chumpa del uniforme de educación física.',
        tipoTalla: 'LETRA',
        stockMinimo: 3,
        tallas: tallasLetra(195, { XS: 3, S: 6, M: 8, L: 4, XL: 0 }),
        fotos: ['foto.22.jpg', 'foto.25.jpg', 'foto.27.jpg'],
      },
    ],
  },
];

// Estructura escolar de ejemplo: ajustar a los grados reales del colegio.
const NIVELES: Array<{ nombre: string; orden: number; grados: string[] }> = [
  { nombre: 'Preprimaria', orden: 1, grados: ['Prekínder', 'Kínder', 'Preparatoria'] },
  {
    nombre: 'Primaria',
    orden: 2,
    grados: [
      '1ro Primaria',
      '2do Primaria',
      '3ro Primaria',
      '4to Primaria',
      '5to Primaria',
      '6to Primaria',
    ],
  },
  { nombre: 'Básicos', orden: 3, grados: ['1ro Básico', '2do Básico', '3ro Básico'] },
  { nombre: 'Diversificado', orden: 4, grados: ['4to Bachillerato', '5to Bachillerato'] },
];

const ANIO_CICLO = 2026;

type BolsaDef = {
  grado: string;
  precio: number;
  costo: number;
  stockInicial: number;
  stockMinimo: number;
  contenido: Array<{ cantidad: number; unidad?: string; descripcion: string }>;
};

/**
 * Lo unico que se ingresa es "tengo N bolsas de tal grado". El contenido es la
 * lista que se imprime: es OPCIONAL, y aqui hay bolsas con lista y bolsas sin
 * ella a proposito, para que se vea que ambas funcionan igual.
 */
const BOLSAS: BolsaDef[] = [
  {
    grado: '1ro Primaria',
    precio: 325,
    costo: 240,
    stockInicial: 18,
    stockMinimo: 5,
    contenido: [
      { cantidad: 4, descripcion: 'Cuaderno doble línea 80 hojas' },
      { cantidad: 2, descripcion: 'Cuaderno cuadriculado 80 hojas' },
      { cantidad: 1, unidad: 'caja', descripcion: 'Crayones de cera, 12 colores' },
      { cantidad: 2, descripcion: 'Lápiz de grafito No. 2' },
      { cantidad: 1, descripcion: 'Borrador blanco' },
      { cantidad: 1, descripcion: 'Sacapuntas con depósito' },
      { cantidad: 1, unidad: 'barra', descripcion: 'Goma en barra' },
      { cantidad: 1, unidad: 'resma', descripcion: 'Hojas bond tamaño carta' },
    ],
  },
  {
    grado: '2do Primaria',
    precio: 340,
    costo: 255,
    stockInicial: 12,
    stockMinimo: 5,
    contenido: [],
  },
  {
    grado: '3ro Primaria',
    precio: 365,
    costo: 270,
    stockInicial: 9,
    stockMinimo: 5,
    contenido: [],
  },
  {
    grado: '4to Primaria',
    precio: 385,
    costo: 290,
    stockInicial: 25, // "tengo 25 bolsas de 4to primaria"
    stockMinimo: 5,
    contenido: [
      { cantidad: 5, descripcion: 'Cuaderno cuadriculado 100 hojas' },
      { cantidad: 2, descripcion: 'Cuaderno de doble raya 100 hojas' },
      { cantidad: 1, unidad: 'caja', descripcion: 'Lápices de color, 12 unidades' },
      { cantidad: 1, descripcion: 'Juego de geometría' },
      { cantidad: 2, descripcion: 'Lapicero azul' },
      { cantidad: 1, descripcion: 'Lapicero rojo' },
      { cantidad: 1, descripcion: 'Regla de 30 cm' },
      { cantidad: 1, unidad: 'resma', descripcion: 'Hojas bond tamaño carta' },
      { cantidad: 1, descripcion: 'Folder con gancho' },
    ],
  },
  {
    grado: '5to Primaria',
    precio: 395,
    costo: 300,
    stockInicial: 7,
    stockMinimo: 5,
    contenido: [],
  },
  {
    grado: '6to Primaria',
    precio: 410,
    costo: 310,
    stockInicial: 0, // agotada: se muestra, pero no se puede vender
    stockMinimo: 5,
    contenido: [],
  },
];

async function sembrarUsuarios() {
  const passwordDev = process.env['SEED_ADMIN_PASSWORD'] ?? 'inventario-dev-2026';
  const passwordHash = await hash(passwordDev);

  const definiciones = [
    { usuario: 'admin', nombre: 'Administradora', rol: 'ADMIN' as const },
    { usuario: 'lucia.m', nombre: 'Lucía Méndez', rol: 'VENDEDOR' as const },
    { usuario: 'ana.c', nombre: 'Ana Castillo', rol: 'VENDEDOR' as const },
  ];

  for (const definicion of definiciones) {
    await prisma.usuario.upsert({
      where: { usuario: definicion.usuario },
      // No se toca el hash de un usuario que ya existe: si la admin ya cambio su
      // contrasena, el seed no la pisa.
      update: { nombre: definicion.nombre, rol: definicion.rol },
      create: { ...definicion, passwordHash },
    });
  }

  const admin = await prisma.usuario.findUniqueOrThrow({ where: { usuario: 'admin' } });
  return admin.id;
}

async function sembrarEstructuraEscolar() {
  for (const nivelDef of NIVELES) {
    const nivel = await prisma.nivel.upsert({
      where: { nombre: nivelDef.nombre },
      update: { orden: nivelDef.orden },
      create: { nombre: nivelDef.nombre, orden: nivelDef.orden },
    });

    for (const [indice, nombreGrado] of nivelDef.grados.entries()) {
      await prisma.grado.upsert({
        where: { nivelId_nombre: { nivelId: nivel.id, nombre: nombreGrado } },
        update: { orden: indice + 1 },
        create: { nivelId: nivel.id, nombre: nombreGrado, orden: indice + 1 },
      });
    }
  }

  const ciclo = await prisma.cicloEscolar.upsert({
    where: { anio: ANIO_CICLO },
    update: {},
    create: { anio: ANIO_CICLO, activo: true },
  });

  // Solo un ciclo activo a la vez.
  if (!ciclo.activo) {
    await prisma.$transaction([
      prisma.cicloEscolar.updateMany({ where: { activo: true }, data: { activo: false } }),
      prisma.cicloEscolar.update({ where: { id: ciclo.id }, data: { activo: true } }),
    ]);
  }

  return ciclo;
}

/** Registra la existencia inicial SOLO si el item todavia no tiene movimientos. */
async function aperturaDeStock(itemId: string, cantidad: number, usuarioId: string) {
  if (cantidad <= 0) return false;

  const yaTieneMovimientos = await prisma.movimientoStock.count({ where: { itemId } });
  if (yaTieneMovimientos > 0) return false;

  await prisma.$transaction((tx) =>
    registrarMovimiento(tx, {
      itemId,
      cantidad,
      tipo: 'APERTURA',
      usuarioId,
      motivo: 'Existencia inicial al montar el sistema (seed)',
    }),
  );
  return true;
}

async function sembrarUniformes(usuarioId: string) {
  let variantesCreadas = 0;
  let aperturas = 0;

  for (const categoriaDef of CATALOGO) {
    const categoria = await prisma.categoriaUniforme.upsert({
      where: { codigo: categoriaDef.codigo },
      update: { nombre: categoriaDef.nombre, orden: categoriaDef.orden },
      create: {
        codigo: categoriaDef.codigo,
        nombre: categoriaDef.nombre,
        orden: categoriaDef.orden,
      },
    });

    for (const prendaDef of categoriaDef.prendas) {
      const prenda = await prisma.prenda.upsert({
        where: { categoriaId_nombre: { categoriaId: categoria.id, nombre: prendaDef.nombre } },
        update: { descripcion: prendaDef.descripcion, tipoTalla: prendaDef.tipoTalla },
        create: {
          categoriaId: categoria.id,
          nombre: prendaDef.nombre,
          descripcion: prendaDef.descripcion,
          tipoTalla: prendaDef.tipoTalla,
        },
      });

      for (const [indice, nombreArchivo] of prendaDef.fotos.entries()) {
        const existente = await prisma.media.findFirst({
          where: { prendaId: prenda.id, path: nombreArchivo },
        });
        if (!existente) {
          await prisma.media.create({
            data: {
              prendaId: prenda.id,
              path: nombreArchivo,
              alt: `${prendaDef.nombre} - foto ${indice + 1}`,
              orden: indice,
              esPrincipal: indice === 0,
            },
          });
        }
      }

      for (const tallaDef of prendaDef.tallas) {
        const talla = normalizarTalla(tallaDef.talla, prendaDef.tipoTalla);

        let variante = await prisma.uniformeVariante.findUnique({
          where: { prendaId_talla: { prendaId: prenda.id, talla } },
          include: { item: true },
        });

        if (!variante) {
          const item = await prisma.inventoryItem.create({
            data: {
              tipo: 'UNIFORME_TALLA',
              sku: skuVariante(categoria.codigo, prenda.nombre, talla),
              nombre: `${prenda.nombre} - ${talla}`,
              precioCentavos: tallaDef.precioCentavos,
              stockMinimo: prendaDef.stockMinimo,
            },
          });
          variante = await prisma.uniformeVariante.create({
            data: {
              prendaId: prenda.id,
              talla,
              ordenTalla: ordenDeTalla(talla, prendaDef.tipoTalla),
              itemId: item.id,
            },
            include: { item: true },
          });
          variantesCreadas += 1;
        }

        if (await aperturaDeStock(variante.itemId, tallaDef.stockInicial, usuarioId)) {
          aperturas += 1;
        }
      }
    }
  }

  return { variantesCreadas, aperturas };
}

async function sembrarBolsas(cicloId: string, anio: number, usuarioId: string) {
  let bolsasCreadas = 0;
  let aperturas = 0;

  for (const bolsaDef of BOLSAS) {
    const grado = await prisma.grado.findFirst({ where: { nombre: bolsaDef.grado } });
    if (!grado) {
      console.warn(`  ! No existe el grado "${bolsaDef.grado}", se omite su bolsa`);
      continue;
    }

    let bolsa = await prisma.bolsaUtiles.findUnique({
      where: { gradoId_cicloId_version: { gradoId: grado.id, cicloId, version: 1 } },
    });

    if (!bolsa) {
      const nombre = `Bolsa de útiles - ${grado.nombre} - ${anio}`;
      const item = await prisma.inventoryItem.create({
        data: {
          tipo: 'BOLSA_UTILES',
          sku: skuBolsa(grado.nombre, anio, 1),
          nombre,
          precioCentavos: Q(bolsaDef.precio),
          costoCentavos: Q(bolsaDef.costo),
          stockMinimo: bolsaDef.stockMinimo,
        },
      });

      bolsa = await prisma.bolsaUtiles.create({
        data: {
          gradoId: grado.id,
          cicloId,
          version: 1,
          nombre,
          itemId: item.id,
          contenido: {
            create: bolsaDef.contenido.map((linea, indice) => ({
              descripcion: linea.descripcion,
              cantidad: linea.cantidad,
              unidad: linea.unidad ?? null,
              orden: indice,
            })),
          },
        },
      });
      bolsasCreadas += 1;
    }

    if (await aperturaDeStock(bolsa.itemId, bolsaDef.stockInicial, usuarioId)) {
      aperturas += 1;
    }
  }

  return { bolsasCreadas, aperturas };
}

async function main() {
  console.log('Sembrando datos iniciales...\n');

  const usuarioId = await sembrarUsuarios();
  console.log('  usuarios: admin + 2 maestras');

  const ciclo = await sembrarEstructuraEscolar();
  const grados = await prisma.grado.count();
  console.log(`  estructura escolar: ${NIVELES.length} niveles, ${grados} grados`);
  console.log(`  ciclo escolar ${ciclo.anio} (activo)`);

  const uniformes = await sembrarUniformes(usuarioId);
  console.log(
    `  uniformes: ${uniformes.variantesCreadas} tallas nuevas, ${uniformes.aperturas} aperturas de stock`,
  );

  const bolsas = await sembrarBolsas(ciclo.id, ciclo.anio, usuarioId);
  console.log(
    `  bolsas de útiles: ${bolsas.bolsasCreadas} nuevas, ${bolsas.aperturas} aperturas de stock`,
  );

  const totalItems = await prisma.inventoryItem.count();
  const unidades = await prisma.inventoryItem.aggregate({ _sum: { stockActual: true } });
  console.log(
    `\nListo. ${totalItems} items vendibles, ${unidades._sum.stockActual ?? 0} unidades en existencia.`,
  );
  console.log(
    'Recordatorio: los PRECIOS son de ejemplo (ver PRECIOS DE EJEMPLO en prisma/seed.ts).',
  );
  console.log('La contrasena de los usuarios sembrados es SEED_ADMIN_PASSWORD del .env.\n');
}

try {
  await main();
} catch (error) {
  console.error('El seed fallo:', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
