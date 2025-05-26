# Migration Guide: v2.0.0

## Breaking Changes

This release fixes the "SchemaSchema" duplication issue and introduces a **type-safe, configurable naming system** for generated Zod schemas.

Thanks for the bug reports and suggestions! [@Psycarlo](https://github.com/dohooo/supazod/issues/3)

## What Changed

### 1. Fixed Zod Schema Names (No More Duplication)
**Before (v1.x)** - Generated schema names had duplicated "Schema" suffixes:
```typescript
// ❌ Old naming (duplicated Schema)
export const publicUsersInsertSchemaSchema = z.object({...});
export const publicUsersUpdateSchemaSchema = z.object({...});
export const publicGetStatusArgsSchemaSchema = z.object({...});
```

**After (v2.x)** - Clean, consistent naming without duplication:
```typescript
// ✅ New naming (fixed duplication)
export const publicUsersInsertSchema = z.object({...});
export const publicUsersUpdateSchema = z.object({...});
export const publicGetStatusArgsSchema = z.object({...});
```

### 2. TypeScript Types No Longer Have "Schema" Suffix
**Before (v1.x)** - Generated TypeScript types had unnecessary "Schema" suffixes:
```typescript
// ❌ Old types (unnecessary Schema suffix)
export type PublicUsersInsertSchema = z.infer<typeof generated.publicUsersInsertSchemaSchema>;
export type PublicUserStatusSchema = z.infer<typeof generated.publicUserStatusSchemaSchema>;
```

**After (v2.x)** - Clean type names without "Schema" suffix:
```typescript
// ✅ New types (clean names)
export type PublicUsersInsert = z.infer<typeof generated.publicUsersInsertSchema>;
export type PublicUserStatus = z.infer<typeof generated.publicUserStatusSchema>;
```

### 3. Type-Safe Configuration System (New Feature)
We've introduced a fully type-safe configuration system with IntelliSense support:

```typescript
// ✅ TypeScript config with full type safety and autocomplete
import { defineConfig } from 'supazod';

export default defineConfig({
  namingConfig: {
    tableOperationPattern: '{schema}_{table}_{operation}', // Autocomplete for placeholders!
    enumPattern: '{schema}_{name}_Enum',
    capitalizeSchema: true,
  }
});
```

## Default Configuration

The new default naming patterns are:

- **Table Operations**: `{schema}{table}{operation}` → `PublicUsersInsert`
- **Enums**: `{schema}{name}` → `PublicUserStatus`
- **Functions**: `{schema}{function}Args/Returns` → `PublicGetStatusArgs`

## Migration Steps

### Step 1: Update Dependencies
```bash
npm install supazod@^2.0.0
```

### Step 2: Update Import Names
Replace the old duplicated schema names in your code:

```typescript
// ❌ Before
import { publicUsersInsertSchemaSchema } from './schema';
const result = publicUsersInsertSchemaSchema.parse(data);

// ✅ After  
import { publicUsersInsertSchema } from './schema';
const result = publicUsersInsertSchema.parse(data);
```

### Step 3: Update Type Import Names
Replace the old type names with new clean names:

```typescript
// ❌ Before
import type { PublicUsersInsertSchema } from './schema';
const user: PublicUsersInsertSchema = {...};

// ✅ After
import type { PublicUsersInsert } from './schema';
const user: PublicUsersInsert = {...};
```

### Step 4: Regenerate Schemas
```bash
npx supazod -i types.ts -o schema.ts
```

## Configuration Methods

### Method 1: TypeScript Configuration (Recommended)

Create a `supazod.config.ts` file with full type safety:

```typescript
// supazod.config.ts
import { defineConfig } from 'supazod';

export default defineConfig({
  namingConfig: {
    // TypeScript provides autocomplete for these placeholders:
    // {schema}, {table}, {operation}, {function}, {name}
    tableOperationPattern: '{schema}_{table}_{operation}',
    enumPattern: '{schema}_{name}_Enum',
    functionArgsPattern: '{schema}_{function}_Args',
    functionReturnsPattern: '{schema}_{function}_Returns',
    
    // Type-safe boolean options
    capitalizeSchema: true,
    capitalizeNames: true,
    separator: '_',
  }
});
```

### Method 2: JavaScript Configuration

Create a `supazod.config.js` file:

```javascript
// supazod.config.js
export default {
  namingConfig: {
    tableOperationPattern: '{schema}_{table}_{operation}',
    enumPattern: '{schema}_{name}_Enum',
    capitalizeSchema: true,
    capitalizeNames: true,
    separator: '_',
  }
};
```

### Method 3: JSON Configuration

Create a `supazod.config.json` file:

```json
{
  "namingConfig": {
    "tableOperationPattern": "{schema}_{table}_{operation}",
    "enumPattern": "{schema}_{name}_Enum",
    "capitalizeSchema": true,
    "capitalizeNames": true,
    "separator": "_"
  }
}
```

**Supported config file names:**
- `supazod.config.ts` (recommended for type safety)
- `supazod.config.js`
- `supazod.config.mjs`
- `supazod.config.json`
- `.supazodrc.ts`
- `.supazodrc.js`
- `.supazodrc.mjs`
- `.supazodrc.json`
- `.supazodrc`

Then run the CLI normally:
```bash
npx supazod -i types.ts -o schema.ts
```

### Method 4: CLI Arguments

You can override configuration via command line arguments:

```bash
npx supazod -i types.ts -o schema.ts \
  --table-operation-pattern '{schema}_{table}_{operation}' \
  --enum-pattern '{schema}_{name}_Enum' \
  --capitalize-schema true \
  --capitalize-names false \
  --separator '_'
```

**Available CLI Options:**
- `--table-operation-pattern <pattern>` - Pattern for table operations
- `--enum-pattern <pattern>` - Pattern for enums
- `--composite-type-pattern <pattern>` - Pattern for composite types
- `--function-args-pattern <pattern>` - Pattern for function arguments
- `--function-returns-pattern <pattern>` - Pattern for function returns
- `--capitalize-schema <boolean>` - Capitalize schema names (default: true)
- `--capitalize-names <boolean>` - Capitalize type names (default: true)
- `--separator <string>` - Separator between name parts (default: empty)

### Method 5: Programmatic API

```typescript
import { generateContent } from 'supazod';

const result = await generateContent({
  input: './types.ts',
  output: './schema.ts',
  schema: ['public'],
  namingConfig: {
    tableOperationPattern: '{schema}_{table}_{operation}',
    enumPattern: '{schema}_{name}_Enum',
    capitalizeSchema: true,
    capitalizeNames: true,
  }
});
```

## Configuration Priority

Configuration is merged in the following order (highest priority last):
1. **Default configuration**
2. **Configuration file** (`supazod.config.ts`, etc.)
3. **CLI arguments** (override config file)

## Type Safety Features

### Template Literal Types
The new configuration system provides type-safe template patterns:

```typescript
import { defineConfig, type TableOperationPattern } from 'supazod';

// TypeScript will ensure you only use valid placeholders
const pattern: TableOperationPattern = '{schema}{table}{operation}'; // ✅ Valid
const invalid: TableOperationPattern = '{invalid}{placeholder}'; // ❌ TypeScript error
```

### Full IntelliSense Support
When using TypeScript configuration, you get:
- **Autocomplete** for all configuration options
- **Type checking** for pattern placeholders
- **Documentation** on hover
- **Error highlighting** for invalid configurations

## Example Outputs

### Default Configuration
```typescript
// Generated with default settings
export const publicUsersInsertSchema = z.object({...});
export const publicUserStatusSchema = z.union([...]);
export const publicGetStatusArgsSchema = z.object({...});

// Types without Schema suffix
export type PublicUsersInsert = z.infer<typeof generated.publicUsersInsertSchema>;
export type PublicUserStatus = z.infer<typeof generated.publicUserStatusSchema>;
```

### Custom Configuration Example
With this config:
```typescript
// supazod.config.ts
export default defineConfig({
  namingConfig: {
    tableOperationPattern: '{schema}_{table}_{operation}',
    enumPattern: '{schema}_{name}_Enum',
    separator: '_',
  }
});
```

Generated output:
```typescript
// Clean naming without duplication, using custom patterns
export const public_Users_InsertSchema = z.object({...});
export const public_UserStatus_EnumSchema = z.union([...]);

// Types still clean without Schema suffix
export type Public_Users_Insert = z.infer<typeof generated.public_Users_InsertSchema>;
export type Public_UserStatus_Enum = z.infer<typeof generated.public_UserStatus_EnumSchema>;
```

### Available Placeholders
- `{schema}` - Database schema name (e.g., "public", "auth")
- `{table}` - Table name (e.g., "users", "posts") 
- `{operation}` - Operation type (e.g., "Insert", "Update", "Row")
- `{function}` - Function name (e.g., "get_status")
- `{name}` - Type name (e.g., "user_status" for enums)

## Complete Type Definitions

```typescript
// Full type definitions available for import
import type {
  SupazodConfig,
  NamingConfig,
  UserNamingConfig,
  TableOperationPattern,
  EnumPattern,
  CompositeTypePattern,
  FunctionArgsPattern,
  FunctionReturnsPattern,
  defineConfig,
} from 'supazod';
```

## Need Help?

If you encounter issues during migration:

1. Check that all schema name references are updated (remove duplicated "Schema")
2. Update TypeScript type imports (remove "Schema" suffix from type names)
3. Regenerate your schemas with the new version
4. Consider migrating to TypeScript config for better development experience
5. Verify your TypeScript types compile correctly
6. Run your tests to ensure compatibility

For complex naming requirements, use the new type-safe configuration options to customize the output to match your existing code patterns. 