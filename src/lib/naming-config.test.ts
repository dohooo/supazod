import { describe, expect, it } from 'vitest';

import {
  formatName,
  defaultNamingConfig,
  type NamingConfig,
  toSchemaVariableName,
} from './naming-config';

describe('naming-config', () => {
  describe('formatName', () => {
    it('should format names using default configuration', () => {
      const result = formatName(
        '{schema}{table}{operation}',
        {
          schema: 'public',
          table: 'users',
          operation: 'Insert',
        },
        defaultNamingConfig,
      );
      expect(result).toBe('PublicUsersInsert');
    });

    it('should handle snake_case schema names', () => {
      const result = formatName(
        '{schema}{table}{operation}',
        {
          schema: 'schema_b',
          table: 'users',
          operation: 'Update',
        },
        defaultNamingConfig,
      );
      expect(result).toBe('SchemaBUsersUpdate');
    });

    it('should respect capitalization settings', () => {
      const config: NamingConfig = {
        ...defaultNamingConfig,
        capitalizeSchema: false,
        capitalizeNames: false,
      };

      const result = formatName(
        '{schema}{table}{operation}',
        {
          schema: 'public',
          table: 'users',
          operation: 'Insert',
        },
        config,
      );
      expect(result).toBe('publicusersInsert');
    });

    it('should work with custom patterns', () => {
      const result = formatName(
        '{schema}_{table}_{operation}_Type',
        {
          schema: 'public',
          table: 'users',
          operation: 'Insert',
        },
        defaultNamingConfig,
      );
      expect(result).toBe('Public_Users_Insert_Type');
    });

    it('should handle enum patterns', () => {
      const result = formatName(
        '{schema}{name}',
        {
          schema: 'public',
          name: 'user_status',
        },
        defaultNamingConfig,
      );
      expect(result).toBe('PublicUserStatus');
    });

    it('should handle function patterns', () => {
      const argsResult = formatName(
        '{schema}{function}Args',
        {
          schema: 'public',
          function: 'get_status',
        },
        defaultNamingConfig,
      );
      expect(argsResult).toBe('PublicGetStatusArgs');

      const returnsResult = formatName(
        '{schema}{function}Returns',
        {
          schema: 'public',
          function: 'get_status',
        },
        defaultNamingConfig,
      );
      expect(returnsResult).toBe('PublicGetStatusReturns');
    });

    it('should handle missing placeholders gracefully', () => {
      const result = formatName(
        '{schema}{table}{missing}',
        {
          schema: 'public',
          table: 'users',
        },
        defaultNamingConfig,
      );
      expect(result).toBe('PublicUsers{missing}');
    });

    it('should handle complex snake_case names', () => {
      const result = formatName(
        '{schema}_{table}_{operation}',
        {
          schema: 'my_complex_schema',
          table: 'user_profile_data',
          operation: 'bulk_insert',
        },
        defaultNamingConfig,
      );
      expect(result).toBe('MyComplexSchema_UserProfileData_BulkInsert');
    });

    it('should work with empty separator', () => {
      const config: NamingConfig = {
        ...defaultNamingConfig,
        separator: '',
      };

      const result = formatName(
        '{schema}-{table}-{operation}',
        {
          schema: 'public',
          table: 'users',
          operation: 'Insert',
        },
        config,
      );
      expect(result).toBe('Public-Users-Insert');
    });

    it('should handle mixed capitalization settings', () => {
      const config: NamingConfig = {
        ...defaultNamingConfig,
        capitalizeSchema: true,
        capitalizeNames: false,
      };

      const result = formatName(
        '{schema}_{table}_{operation}',
        {
          schema: 'public',
          table: 'users',
          operation: 'Insert',
        },
        config,
      );
      expect(result).toBe('Public_users_Insert');
    });

    it('should handle complex patterns with repeated placeholders', () => {
      const result = formatName(
        '{name}_{schema}_{schema}_Enum',
        {
          name: 'student_status',
          schema: 'public',
        },
        defaultNamingConfig,
      );
      expect(result).toBe('StudentStatus_Public_Public_Enum');
    });

    it('should handle multi-placeholder table operation patterns', () => {
      const result = formatName(
        '{schema}_{schema}_{operation}_{table}_Type',
        {
          schema: 'public',
          operation: 'Insert',
          table: 'staff',
        },
        defaultNamingConfig,
      );
      expect(result).toBe('Public_Public_Insert_Staff_Type');
    });

    it('should distinguish between type and schema suffixes', () => {
      const typeResult = formatName(
        '{name}_Type',
        {
          name: 'student_status',
        },
        defaultNamingConfig,
      );

      const schemaResult = formatName(
        '{name}_Schema',
        {
          name: 'student_status',
        },
        defaultNamingConfig,
      );

      expect(typeResult).toBe('StudentStatus_Type');
      expect(schemaResult).toBe('StudentStatus_Schema');
    });

    describe('toSchemaVariableName', () => {
      it('should convert PascalCase to camelCase with Schema suffix', () => {
        expect(toSchemaVariableName('PublicUsersInsert')).toBe(
          'publicUsersInsertSchema',
        );
      });

      it('should convert names with underscores', () => {
        expect(toSchemaVariableName('Public_Users_Insert')).toBe(
          'publicUsersInsertSchema',
        );
      });

      it('should avoid duplicating Schema suffix', () => {
        expect(toSchemaVariableName('PublicUsersSchema')).toBe(
          'publicUsersSchema',
        );
      });

      it('should handle empty input gracefully', () => {
        expect(toSchemaVariableName('')).toBe('Schema');
      });

      it('should preserve separators when requested', () => {
        expect(toSchemaVariableName('Public_Users_Insert_Schema', true)).toBe(
          'public_users_insert_schema',
        );
      });

      it('should sanitize non-alphanumeric separators when preserving', () => {
        expect(toSchemaVariableName('Public Users Insert Schema', true)).toBe(
          'public_users_insert_schema',
        );
      });
    });
  });
});
