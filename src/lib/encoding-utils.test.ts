import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  detectFileEncoding,
  isUtf16Encoding,
  Utf16EncodingError,
} from './encoding-utils';

describe('encoding-utils', () => {
  describe('detectFileEncoding', () => {
    it('should detect UTF-8 encoded files', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'supazod-encoding-test-'));
      try {
        const filePath = join(tempDir, 'utf8-file.ts');
        // Write a standard UTF-8 file
        writeFileSync(
          filePath,
          'export type Database = { public: {} };',
          'utf-8',
        );

        const encoding = await detectFileEncoding(filePath);
        expect(encoding).toBe('utf-8');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should detect UTF-16 LE encoded files (with BOM)', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'supazod-encoding-test-'));
      try {
        const filePath = join(tempDir, 'utf16le-file.ts');
        // UTF-16 LE BOM is 0xFF 0xFE
        const content = 'export type Database = { public: {} };';
        const bom = Buffer.from([0xff, 0xfe]);
        const utf16leContent = Buffer.from(content, 'utf16le');
        const fullContent = Buffer.concat([bom, utf16leContent]);
        writeFileSync(filePath, fullContent);

        const encoding = await detectFileEncoding(filePath);
        expect(encoding).toBe('utf-16le');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should detect UTF-16 BE encoded files (with BOM)', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'supazod-encoding-test-'));
      try {
        const filePath = join(tempDir, 'utf16be-file.ts');
        // UTF-16 BE BOM is 0xFE 0xFF
        const bom = Buffer.from([0xfe, 0xff]);
        // Manually create UTF-16 BE content
        const content = 'export type Database = { public: {} };';
        const utf16beContent = Buffer.alloc(content.length * 2);
        for (let i = 0; i < content.length; i++) {
          const charCode = content.charCodeAt(i);
          utf16beContent[i * 2] = (charCode >> 8) & 0xff; // High byte first (BE)
          utf16beContent[i * 2 + 1] = charCode & 0xff; // Low byte second
        }
        const fullContent = Buffer.concat([bom, utf16beContent]);
        writeFileSync(filePath, fullContent);

        const encoding = await detectFileEncoding(filePath);
        expect(encoding).toBe('utf-16be');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should detect UTF-16 LE without BOM by checking null bytes pattern', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'supazod-encoding-test-'));
      try {
        const filePath = join(tempDir, 'utf16le-no-bom.ts');
        // UTF-16 LE without BOM - ASCII characters have null byte after each char
        const content = 'export type Database = { public: {} };';
        const utf16leContent = Buffer.from(content, 'utf16le');
        writeFileSync(filePath, utf16leContent);

        const encoding = await detectFileEncoding(filePath);
        expect(encoding).toBe('utf-16le');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('isUtf16Encoding', () => {
    it('should return true for utf-16le', () => {
      expect(isUtf16Encoding('utf-16le')).toBe(true);
    });

    it('should return true for utf-16be', () => {
      expect(isUtf16Encoding('utf-16be')).toBe(true);
    });

    it('should return false for utf-8', () => {
      expect(isUtf16Encoding('utf-8')).toBe(false);
    });
  });

  describe('Utf16EncodingError', () => {
    it('should have a descriptive error message', () => {
      const error = new Utf16EncodingError('/path/to/file.ts', 'utf-16le');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('Utf16EncodingError');
      expect(error.message).toContain('UTF-16');
      expect(error.message).toContain('/path/to/file.ts');
      expect(error.filePath).toBe('/path/to/file.ts');
      expect(error.detectedEncoding).toBe('utf-16le');
    });

    it('should include PowerShell suggestion in error message', () => {
      const error = new Utf16EncodingError('/path/to/file.ts', 'utf-16le');

      expect(error.message).toContain('PowerShell');
      expect(error.message).toContain('Out-File');
      expect(error.message).toContain('-Encoding utf8');
    });
  });

  describe('edge cases', () => {
    it('should handle empty files as UTF-8', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'supazod-encoding-test-'));
      try {
        const filePath = join(tempDir, 'empty-file.ts');
        writeFileSync(filePath, '');

        const encoding = await detectFileEncoding(filePath);
        expect(encoding).toBe('utf-8');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should handle very small files (< 4 bytes) as UTF-8', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'supazod-encoding-test-'));
      try {
        const filePath = join(tempDir, 'tiny-file.ts');
        writeFileSync(filePath, 'ab'); // Only 2 bytes

        const encoding = await detectFileEncoding(filePath);
        expect(encoding).toBe('utf-8');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should detect UTF-8 files with BOM', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'supazod-encoding-test-'));
      try {
        const filePath = join(tempDir, 'utf8-bom-file.ts');
        // UTF-8 BOM is 0xEF 0xBB 0xBF
        const bom = Buffer.from([0xef, 0xbb, 0xbf]);
        const content = Buffer.from('export type Database = {};', 'utf-8');
        const fullContent = Buffer.concat([bom, content]);
        writeFileSync(filePath, fullContent);

        const encoding = await detectFileEncoding(filePath);
        expect(encoding).toBe('utf-8');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
