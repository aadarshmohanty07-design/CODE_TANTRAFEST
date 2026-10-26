import {
  createHash,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions
) => Promise<Buffer>;

const SCRYPT_OPTIONS: ScryptOptions = {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function nameKey(name: string): string {
  return normalizeName(name).toLocaleLowerCase("en-US");
}

export function normalizeInviteCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function hashPasscode(passcode: string): Promise<{
  salt: string;
  hash: string;
}> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(
    passcode.normalize("NFKC"),
    salt,
    32,
    SCRYPT_OPTIONS
  );
  return { salt, hash: derived.toString("hex") };
}

export async function verifyPasscode(
  passcode: string,
  salt: string,
  expectedHex: string
): Promise<boolean> {
  try {
    const derived = await scryptAsync(
      passcode.normalize("NFKC"),
      salt,
      32,
      SCRYPT_OPTIONS
    );
    const expected = Buffer.from(expectedHex, "hex");
    return (
      derived.length === expected.length && timingSafeEqual(derived, expected)
    );
  } catch {
    return false;
  }
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateInviteCode(): string {
  const raw = Array.from(
    { length: 12 },
    () => INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)]
  ).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

export function hashInviteCode(code: string): string {
  return createHash("sha256")
    .update(normalizeInviteCode(code))
    .digest("hex");
}

export function setupCodeMatches(input: string, expected: string): boolean {
  const left = Buffer.from(input);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
