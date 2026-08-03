import { getAllPlans } from "@/lib/adminData";
import PlansEditor from "./PlansEditor";

export const dynamic = "force-dynamic";

export default async function AdminPlanosPage() {
  const plans = await getAllPlans();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Planos</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Edite preço, título e recursos. As mudanças aparecem na landing e no painel dos lojistas.
      </p>
      {plans.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
          Nenhum plano encontrado. Rode a migration <code>supabase-migration-admin.sql</code> no Supabase.
        </p>
      ) : (
        <PlansEditor plans={plans} />
      )}
    </div>
  );
}
