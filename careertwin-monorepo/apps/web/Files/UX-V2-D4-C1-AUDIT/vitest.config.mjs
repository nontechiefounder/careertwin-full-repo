import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'transform-lib-auth-jsx',
      transform(code, id) {
        if (id.includes('lib/auth.js')) {
          return {
            code: code.replace(
              '<AuthContext.Provider value={{ user, loading, login, loginWithProvider, register, logout }}>\n      {children}\n    </AuthContext.Provider>',
              'jsx(AuthContext.Provider, { value: { user, loading, login, loginWithProvider, register, logout }, children })'
            ).replace(
              "import { createContext, useContext, useState, useEffect, useCallback } from 'react';",
              "import { createContext, useContext, useState, useEffect, useCallback } from 'react'; import { jsx } from 'react/jsx-runtime';"
            ),
            map: null,
          };
        }
      },
    },
  ],
  server: {
    fs: {
      allow: ['..']
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./__tests__/setup.js'],
    include: [
      '__tests__/**/*.{test,spec}.{js,jsx,ts,tsx}',
      '../../packages/**/*.{test,spec}.{js,jsx,ts,tsx}',
    ],
    exclude: [
      ...configDefaults.exclude,
      '**/*Assertions.test.js',
    ],
    alias: {
      '@': path.resolve(__dirname, './'),
      '@packages/shared-contracts': path.resolve(__dirname, '../../packages/shared-contracts/src/index.ts'),
      '@packages/hiring-genome': path.resolve(__dirname, '../../packages/hiring-genome/src/index.ts'),
      '@packages/proof-engine': path.resolve(__dirname, '../../packages/proof-engine/src/index.ts'),
    },
  },
});
