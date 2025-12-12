import fs from 'node:fs/promises';

export type FileEncoding = 'utf-8' | 'utf-16le' | 'utf-16be';

/**
 * Custom error class for UTF-16 encoding issues.
 * Provides helpful information about why the file cannot be processed
 * and how to fix it (particularly for PowerShell users).
 */
export class Utf16EncodingError extends Error {
  public readonly filePath: string;
  public readonly detectedEncoding: FileEncoding;

  constructor(filePath: string, detectedEncoding: FileEncoding) {
    const message = `The input file "${filePath}" appears to be encoded as ${detectedEncoding.toUpperCase()}.

supazod requires UTF-8 encoded files. This commonly happens when using PowerShell's ">" redirect operator, which outputs UTF-16 by default.

To fix this, regenerate your types file using one of these methods:

For PowerShell:
  supabase gen types typescript --local | Out-File -FilePath types.ts -Encoding utf8

For Bash/Zsh/CMD:
  supabase gen types typescript --local > types.ts

Alternatively, convert the existing file to UTF-8 using your editor or a tool like iconv.`;

    super(message);
    this.name = 'Utf16EncodingError';
    this.filePath = filePath;
    this.detectedEncoding = detectedEncoding;
  }
}

/**
 * Detects the encoding of a file by examining its byte order mark (BOM)
 * and content patterns.
 *
 * @param filePath - Path to the file to check
 * @returns The detected encoding ('utf-8', 'utf-16le', or 'utf-16be')
 */
export async function detectFileEncoding(
  filePath: string,
): Promise<FileEncoding> {
  const buffer = await fs.readFile(filePath);

  // Check for BOM (Byte Order Mark)
  if (buffer.length >= 2) {
    // UTF-16 LE BOM: 0xFF 0xFE
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      return 'utf-16le';
    }
    // UTF-16 BE BOM: 0xFE 0xFF
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      return 'utf-16be';
    }
  }

  // Check for UTF-8 BOM (optional, UTF-8 files often don't have BOM)
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    return 'utf-8';
  }

  // No BOM found, check for UTF-16 patterns in content
  // UTF-16 LE for ASCII text has null bytes in odd positions (after each ASCII char)
  // UTF-16 BE for ASCII text has null bytes in even positions (before each ASCII char)
  if (buffer.length >= 4) {
    const hasUtf16LePattern = detectUtf16LePattern(buffer);
    if (hasUtf16LePattern) {
      return 'utf-16le';
    }

    const hasUtf16BePattern = detectUtf16BePattern(buffer);
    if (hasUtf16BePattern) {
      return 'utf-16be';
    }
  }

  // Default to UTF-8
  return 'utf-8';
}

/**
 * Detects UTF-16 LE encoding by checking for null bytes in odd positions.
 * For ASCII text in UTF-16 LE, the pattern is: [char][0x00][char][0x00]...
 */
function detectUtf16LePattern(buffer: Buffer): boolean {
  // Check the first several bytes for the pattern
  // We need at least some characters to make a reliable determination
  const checkLength = Math.min(buffer.length, 100);

  let nullInOddPosition = 0;
  let totalChecked = 0;

  for (let i = 0; i < checkLength - 1; i += 2) {
    const byte1 = buffer[i];
    const byte2 = buffer[i + 1];

    // For ASCII characters in UTF-16 LE:
    // - First byte is the ASCII value (non-zero for printable chars)
    // - Second byte is 0x00
    if (byte1 !== 0 && byte1 < 128 && byte2 === 0) {
      nullInOddPosition++;
    }
    totalChecked++;
  }

  // If more than 80% of checked pairs match the pattern, it's likely UTF-16 LE
  return totalChecked > 0 && nullInOddPosition / totalChecked > 0.8;
}

/**
 * Detects UTF-16 BE encoding by checking for null bytes in even positions.
 * For ASCII text in UTF-16 BE, the pattern is: [0x00][char][0x00][char]...
 */
function detectUtf16BePattern(buffer: Buffer): boolean {
  const checkLength = Math.min(buffer.length, 100);

  let nullInEvenPosition = 0;
  let totalChecked = 0;

  for (let i = 0; i < checkLength - 1; i += 2) {
    const byte1 = buffer[i];
    const byte2 = buffer[i + 1];

    // For ASCII characters in UTF-16 BE:
    // - First byte is 0x00
    // - Second byte is the ASCII value (non-zero for printable chars)
    if (byte1 === 0 && byte2 !== 0 && byte2 < 128) {
      nullInEvenPosition++;
    }
    totalChecked++;
  }

  // If more than 80% of checked pairs match the pattern, it's likely UTF-16 BE
  return totalChecked > 0 && nullInEvenPosition / totalChecked > 0.8;
}

/**
 * Checks if the given encoding is a UTF-16 variant.
 */
export function isUtf16Encoding(encoding: FileEncoding): boolean {
  return encoding === 'utf-16le' || encoding === 'utf-16be';
}

/**
 * Validates that a file is UTF-8 encoded.
 * Throws Utf16EncodingError if the file is UTF-16 encoded.
 *
 * @param filePath - Path to the file to validate
 * @throws {Utf16EncodingError} If the file is UTF-16 encoded
 */
export async function validateFileEncoding(filePath: string): Promise<void> {
  const encoding = await detectFileEncoding(filePath);

  if (isUtf16Encoding(encoding)) {
    throw new Utf16EncodingError(filePath, encoding);
  }
}
