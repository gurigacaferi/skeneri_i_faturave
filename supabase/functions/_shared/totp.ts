// Based on RFC 6238 (TOTP) and RFC 4226 (HOTP)
// Requires Deno's crypto API for HMAC-SHA1

const ALGORITHM = 'HMAC-SHA1';
const DIGITS = 6;
const PERIOD = 30;
const SECRET_LENGTH = 20; // 160 bits for SHA1

/**
 * Generates a random base32 secret.
 */
function generateSecret(length: number = SECRET_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  
  // Simple Base32 encoding (RFC 4648)
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += base32Chars[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += base32Chars[(value << (5 - bits)) & 31];
  }
  
  // Pad with '=' if necessary (though not strictly required for TOTP URI)
  while (output.length % 8 !== 0) {
    output += '=';
  }
  
  return output.replace(/=/g, '');
}

/**
 * Converts a base32 secret string to a Uint8Array buffer.
 */
function base32ToBuffer(base32: string): Uint8Array {
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  base32 = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  
  let bits = 0;
  let value = 0;
  const buffer: number[] = [];

  for (let i = 0; i < base32.length; i++) {
    const index = base32Chars.indexOf(base32[i]);
    if (index === -1) continue;

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      buffer.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(buffer);
}

/**
 * Generates a one-time password (HOTP) based on a counter.
 */
async function generateHotp(secret: string, counter: number): Promise<string> {
  const secretBuffer = base32ToBuffer(secret);
  
  // Convert counter to 8-byte buffer (big-endian)
  const counterBuffer = new ArrayBuffer(8);
  const view = new DataView(counterBuffer);
  view.setUint32(4, counter, false); // Set the lower 4 bytes (big-endian)

  const key = await crypto.subtle.importKey(
    'raw',
    secretBuffer,
    { name: ALGORITHM },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    ALGORITHM,
    key,
    counterBuffer
  );

  const hmac = new Uint8Array(signature);
  
  // Dynamic Truncation (RFC 4226, Section 5.4)
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = 
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = bin % Math.pow(10, DIGITS);
  
  return otp.toString().padStart(DIGITS, '0');
}

/**
 * Generates a time-based one-time password (TOTP).
 */
async function generateTotp(secret: string, time: number = Date.now()): Promise<string> {
  const counter = Math.floor(time / 1000 / PERIOD);
  return generateHotp(secret, counter);
}

/**
 * Validates a TOTP token against a secret.
 */
async function validateTotp(secret: string, token: string, window: number = 1): Promise<boolean> {
  const currentTime = Date.now();
  
  // Check current time and surrounding windows
  for (let i = -window; i <= window; i++) {
    const checkTime = currentTime + i * PERIOD * 1000;
    const generatedToken = await generateTotp(secret, checkTime);
    if (generatedToken === token) {
      return true;
    }
  }
  return false;
}

/**
 * Generates the key URI for authenticator apps.
 */
function generateKeyUri(email: string, issuer: string, secret: string): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  const label = `${encodedIssuer}:${encodedEmail}`;
  
  const params = new URLSearchParams({
    secret: secret,
    issuer: issuer,
    algorithm: 'SHA1',
    digits: DIGITS.toString(),
    period: PERIOD.toString(),
  });
  
  return `otpauth://totp/${label}?${params.toString()}`;
}

export const totp = {
  generateSecret,
  generateKeyUri,
  validateTotp,
  generateTotp, // Exported for completeness, though validateTotp is usually preferred
};