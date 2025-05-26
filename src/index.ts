import supabaseToZod from './supabase-to-zod';

export { generateContent, supabaseToZodOptionsSchema } from './supabase-to-zod';
export { transformTypes, TransformTypesOptions } from './lib';
export {
  defineConfig,
  type SupazodConfig,
  type NamingConfig,
  type UserNamingConfig,
  type TableOperationPattern,
  type EnumPattern,
  type CompositeTypePattern,
  type FunctionArgsPattern,
  type FunctionReturnsPattern,
} from './lib/naming-config';
export default supabaseToZod;
