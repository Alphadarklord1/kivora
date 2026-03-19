import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { isSupabaseAuthConfigured } from '@/lib/supabase/config';

type SyncSupabaseAuthInput = {
  supabaseAuthId?: string | null;
  email: string;
  password?: string;
  name?: string | null;
  image?: string | null;
  bio?: string | null;
  emailConfirmed?: boolean;
};

function buildUserMetadata(input: SyncSupabaseAuthInput) {
  return {
    name: input.name ?? undefined,
    avatar_url: input.image ?? undefined,
    bio: input.bio ?? undefined,
  };
}

async function findSupabaseUserByEmail(email: string) {
  const client = createSupabaseAdminClient();
  if (!client) return null;

  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < perPage) break;
    page += 1;
  }

  return null;
}

export async function syncSupabaseAuthUser(input: SyncSupabaseAuthInput): Promise<string | null> {
  if (!isSupabaseAuthConfigured()) return null;

  const client = createSupabaseAdminClient();
  if (!client) return null;

  const attrs = {
    email: input.email,
    password: input.password,
    email_confirm: input.emailConfirmed ?? true,
    user_metadata: buildUserMetadata(input),
  };

  try {
    if (input.supabaseAuthId) {
      const { data, error } = await client.auth.admin.updateUserById(input.supabaseAuthId, attrs);
      if (!error) return data.user?.id ?? input.supabaseAuthId;
    }

    const existingByEmail = await findSupabaseUserByEmail(input.email);
    if (existingByEmail) {
      const { data, error } = await client.auth.admin.updateUserById(existingByEmail.id, attrs);
      if (error) throw error;
      return data.user?.id ?? existingByEmail.id;
    }

    const { data, error } = await client.auth.admin.createUser(attrs);
    if (error) throw error;
    return data.user?.id ?? null;
  } catch (error) {
    console.error('[supabase/auth] failed to sync user', error);
    return null;
  }
}

export async function deleteSupabaseAuthUser(supabaseAuthId: string | null | undefined): Promise<void> {
  if (!supabaseAuthId || !isSupabaseAuthConfigured()) return;

  const client = createSupabaseAdminClient();
  if (!client) return;

  try {
    const { error } = await client.auth.admin.deleteUser(supabaseAuthId);
    if (error) {
      console.error('[supabase/auth] failed to delete user', error);
    }
  } catch (error) {
    console.error('[supabase/auth] failed to delete user', error);
  }
}
