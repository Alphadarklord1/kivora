import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { isDesktopOnlyModeEnabled } from '@/lib/runtime/mode';

const LOCAL_AUTH_PREFIX = 'local-auth:';
const STORE_VERSION = 1;
const STORE_PATH = process.env.KIVORA_LOCAL_AUTH_STORE || path.join(os.homedir(), '.kivora', 'local-auth.json');

export interface LocalAuthUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
  bio: string | null;
  studyInterests: string | null;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

interface LocalAuthStore {
  version: number;
  users: LocalAuthUser[];
}

function buildEmptyStore(): LocalAuthStore {
  return { version: STORE_VERSION, users: [] };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function ensureStoreDir() {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
}

async function readStore(): Promise<LocalAuthStore> {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<LocalAuthStore>;
    if (!parsed || !Array.isArray(parsed.users)) {
      return buildEmptyStore();
    }
    return {
      version: typeof parsed.version === 'number' ? parsed.version : STORE_VERSION,
      users: parsed.users.filter((user): user is LocalAuthUser => (
        Boolean(user) &&
        typeof user.id === 'string' &&
        typeof user.email === 'string' &&
        typeof user.name === 'string' &&
        typeof user.passwordHash === 'string'
      )),
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOENT') return buildEmptyStore();
    throw error;
  }
}

async function writeStore(store: LocalAuthStore) {
  await ensureStoreDir();
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

export function canUseLocalAuthFallback() {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.LOCAL_DEMO_MODE === '1' ||
    isDesktopOnlyModeEnabled()
  );
}

export function isLocalAuthUserId(userId: string | null | undefined): userId is string {
  return typeof userId === 'string' && userId.startsWith(LOCAL_AUTH_PREFIX);
}

export function isDatabaseUnreachableError(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current = error;

  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current);
    const err = current as {
      code?: string;
      message?: string;
      cause?: unknown;
    };
    const message = typeof err.message === 'string' ? err.message : '';
    const code = typeof err.code === 'string' ? err.code : '';
    const haystack = `${code} ${message}`.toLowerCase();

    if (
      haystack.includes('enotfound') ||
      haystack.includes('econnrefused') ||
      haystack.includes('etimedout') ||
      haystack.includes('getaddrinfo') ||
      haystack.includes("can't reach database server") ||
      haystack.includes('failed to connect') ||
      haystack.includes('server closed the connection unexpectedly')
    ) {
      return true;
    }

    current = err.cause;
  }

  return false;
}

export async function findLocalAuthUserByEmail(email: string) {
  const normalized = normalizeEmail(email);
  const store = await readStore();
  return store.users.find((user) => user.email === normalized) ?? null;
}

export async function findLocalAuthUserById(userId: string) {
  if (!isLocalAuthUserId(userId)) return null;
  const store = await readStore();
  return store.users.find((user) => user.id === userId) ?? null;
}

export async function createLocalAuthUser(input: {
  email: string;
  password: string;
  name?: string | null;
}) {
  const normalizedEmail = normalizeEmail(input.email);
  const store = await readStore();
  const existing = store.users.find((user) => user.email === normalizedEmail);
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const user: LocalAuthUser = {
    id: `${LOCAL_AUTH_PREFIX}${uuidv4()}`,
    email: normalizedEmail,
    name: input.name?.trim() || normalizedEmail.split('@')[0],
    image: null,
    bio: null,
    studyInterests: null,
    passwordHash: await bcrypt.hash(input.password, 12),
    createdAt: now,
    updatedAt: now,
  };

  store.users.push(user);
  await writeStore(store);
  return user;
}

export async function verifyLocalAuthCredentials(email: string, password: string) {
  const user = await findLocalAuthUserByEmail(email);
  if (!user) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  return valid ? user : null;
}

export async function updateLocalAuthUser(
  userId: string,
  updates: Partial<Pick<LocalAuthUser, 'name' | 'email' | 'image' | 'bio' | 'studyInterests' | 'passwordHash'>>
) {
  const store = await readStore();
  const index = store.users.findIndex((user) => user.id === userId);
  if (index < 0) return null;

  if (updates.email) {
    const normalizedEmail = normalizeEmail(updates.email);
    const duplicate = store.users.find((user) => user.email === normalizedEmail && user.id !== userId);
    if (duplicate) {
      throw new Error('LOCAL_AUTH_EMAIL_IN_USE');
    }
    updates.email = normalizedEmail;
  }

  store.users[index] = {
    ...store.users[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await writeStore(store);
  return store.users[index];
}

export async function deleteLocalAuthUser(userId: string) {
  const store = await readStore();
  const nextUsers = store.users.filter((user) => user.id !== userId);
  if (nextUsers.length === store.users.length) return false;
  store.users = nextUsers;
  await writeStore(store);
  return true;
}
