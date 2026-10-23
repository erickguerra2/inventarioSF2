import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Las pruebas de integracion comparten una sola base de datos, asi que los
    // archivos corren uno despues del otro: en paralelo se pisarian entre si.
    fileParallelism: false,
  },
});
