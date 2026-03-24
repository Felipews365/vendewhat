import Link from "next/link";

export default function LojaNotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-slate-50">
      <span className="text-6xl mb-4">🔍</span>
      <h1 className="text-2xl font-bold text-slate-800 text-center">
        Loja não encontrada
      </h1>
      <p className="text-slate-500 text-center mt-2 max-w-md">
        O endereço pode estar errado ou a loja ainda não está liberada para visitantes.
      </p>
      <p className="text-sm text-slate-600 mt-6 max-w-lg text-center">
        <strong>Dono da loja:</strong> copie o link no painel (Catálogo → Copiar). Se
        ainda assim não abrir, no Supabase rode o script{" "}
        <code className="text-xs bg-slate-200 px-1 rounded">
          supabase-fix-rls-public-catalog.sql
        </code>{" "}
        e confira as variáveis do Vercel.
      </p>
      <Link
        href="/"
        className="mt-8 bg-whatsapp text-white px-6 py-3 rounded-xl font-medium hover:bg-whatsapp-dark transition-colors"
      >
        Ir para o VendeWhat
      </Link>
    </div>
  );
}
