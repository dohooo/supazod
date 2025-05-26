import { defineConfig } from '../src/lib/naming-config';

export default defineConfig({
  namingConfig: {
    // TypeScript will provide autocomplete and type checking for these patterns
    tableOperationPattern: '{schema}{table}{operation}',
    enumPattern: '{schema}{name}',
    functionArgsPattern: '{schema}{function}Args',
    functionReturnsPattern: '{schema}{function}Returns',

    // Type-safe configuration options
    capitalizeSchema: true,
    capitalizeNames: true,
    separator: '',
  },
});
