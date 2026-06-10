import { createServerSupabase } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/**
 * E-mails autorizados a acessar o painel admin do SaaS.
 * Defina em `.env`: ADMIN_EMAILS=voce@exemplo.com,outro@exemplo.com
 */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Verifica se um e-mail está na lista de admins. */
export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return adminEmails().includes(email.trim().toLowerCase());
}

/**
 * Retorna o usuário logado se ele for admin; caso contrário `null`.
 * Usar em Server Components e Route Handlers (nunca no browser).
 */
export async function requireAdmin(): Promise<User | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}
