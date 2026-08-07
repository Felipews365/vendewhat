/**
 * CRM — tarefas e lembretes. Lista, cria, conclui e apaga.
 */
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function resolveStore() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 }
      ),
    };
  }
  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!store?.id) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Loja não encontrada." },
        { status: 404 }
      ),
    };
  }
  const admin = createAdminSupabase();
  if (!admin) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Servidor sem service role." },
        { status: 503 }
      ),
    };
  }
  return { storeId: store.id as string, admin };
}

const MIGRATION_HINT =
  "Não foi possível salvar. Rode a migration crm-notes-tasks no Supabase.";

// GET ?customerId= (opcional) — sem ele, traz a agenda inteira da loja.
export async function GET(req: Request) {
  const ctx = await resolveStore();
  if ("error" in ctx) return ctx.error;
  const { storeId, admin } = ctx;

  const customerId = (new URL(req.url).searchParams.get("customerId") ?? "").trim();

  try {
    let q = admin
      .from("crm_tasks")
      .select("id, customer_id, title, due_at, done_at, source, created_at")
      .eq("store_id", storeId)
      // Em aberto primeiro, e dentro delas a mais vencida no topo.
      .order("done_at", { ascending: true, nullsFirst: true })
      .order("due_at", { ascending: true })
      .limit(200);

    if (customerId) q = q.eq("customer_id", customerId);

    const { data, error } = await q;
    if (error) {
      console.warn("[api/crm/tasks]", error.message);
      return NextResponse.json({ ok: true, tasks: [] });
    }

    // O nome do cliente vem junto para a lista não precisar de outra chamada.
    const tasks = (data ?? []) as Record<string, unknown>[];
    // Sem espalhar o Set: o target de TS do projeto não tem downlevelIteration.
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const t of tasks) {
      const cid = String(t.customer_id ?? "");
      if (cid && !seen.has(cid)) {
        seen.add(cid);
        ids.push(cid);
      }
    }
    const names: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: custs } = await admin
        .from("crm_customers")
        .select("id, name, phone_key")
        .eq("store_id", storeId)
        .in("id", ids);
      for (const c of (custs ?? []) as Record<string, unknown>[]) {
        names[String(c.id)] = String(c.name ?? "") || String(c.phone_key ?? "");
      }
    }

    return NextResponse.json({
      ok: true,
      tasks: tasks.map((t) => ({
        ...t,
        customer_name: t.customer_id ? (names[String(t.customer_id)] ?? "") : "",
      })),
    });
  } catch {
    return NextResponse.json({ ok: true, tasks: [] });
  }
}

type Body = {
  id?: string;
  customerId?: string | null;
  title?: string;
  dueAt?: string;
  done?: boolean;
  remove?: boolean;
};

export async function POST(req: Request) {
  const ctx = await resolveStore();
  if ("error" in ctx) return ctx.error;
  const { storeId, admin } = ctx;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();

  // --- concluir / reabrir / apagar
  if (id) {
    try {
      if (body.remove) {
        await admin
          .from("crm_tasks")
          .delete()
          .eq("store_id", storeId)
          .eq("id", id);
        return NextResponse.json({ ok: true });
      }
      const { error } = await admin
        .from("crm_tasks")
        .update({ done_at: body.done ? new Date().toISOString() : null })
        .eq("store_id", storeId)
        .eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error("[api/crm/tasks]", err);
      return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 500 });
    }
  }

  // --- criar
  const title = String(body.title ?? "").trim().slice(0, 200);
  if (title.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Escreva o que precisa ser feito." },
      { status: 400 }
    );
  }

  const raw = String(body.dueAt ?? "").trim();
  const due = raw ? new Date(raw) : new Date();
  if (!Number.isFinite(due.getTime())) {
    return NextResponse.json({ ok: false, error: "Data inválida." }, { status: 400 });
  }

  try {
    const { data, error } = await admin
      .from("crm_tasks")
      .insert({
        store_id: storeId,
        customer_id: body.customerId || null,
        title,
        due_at: due.toISOString(),
        source: "manual",
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, id: (data as { id?: string } | null)?.id });
  } catch (err) {
    console.error("[api/crm/tasks]", err);
    return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 500 });
  }
}
