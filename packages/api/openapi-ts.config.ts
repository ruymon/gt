import { defineConfig } from '@hey-api/openapi-ts';
import type { UserConfig } from '@hey-api/openapi-ts';

const plugins: UserConfig['plugins'] = [
  // enums: 'javascript' emits runtime const objects for named enum schemas
  // (e.g. ModelProvider), so consumers validate against generated values
  // instead of hand-maintaining allowlists.
  { name: '@hey-api/typescript', enums: 'javascript' },
  // client: false removes the generated singleton client, so every SDK call
  // must receive a configured client (type-enforced) instead of silently
  // falling back to an unconfigured global.
  { name: '@hey-api/sdk', client: false },
  '@hey-api/client-fetch',
];

export default defineConfig([
  {
    input: './spec/openapi.json',
    output: 'src/generated',
    plugins,
  },
  // Frozen 2026-03-06.v1 spec behind the internal `./legacy` subpath; removed in the next major.
  {
    input: './spec/openapi.2026-03-06.v1.json',
    output: 'src/legacy/generated',
    plugins,
  },
]);
