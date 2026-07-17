import * as bcrypt from 'bcryptjs';

// Same cost factor and library as absolute-electron-pos's local login
// (bcryptjs, 10 rounds) — not because hashes are ever shared between the
// two, but so a security review only has to reason about one KDF choice.
const SALT_ROUNDS = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
