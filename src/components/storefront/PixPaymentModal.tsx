"use client";

import { useEffect, useMemo, useState } from "react";
import { buildPixPayload } from "@/lib/pixPayload";
import { useToast } from "@/components/Toast";

type QrModule = {
  toDataURL: (
    text: string,
    opts?: { width?: number; margin?: number }
  ) => Promise<string>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  pixKey: string;
  pixName: string;
  city?: string;
  amount: number;
  orderCode?: number | null;
  /** "Tudo certo, já paguei" — manda o pedido/comprovante pelo WhatsApp. */
  onPaid: () => void;
};

function money(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/** Bloco de passos numerados com a bolinha na cor da loja. */
function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5 text-sm text-slate-600">
          <span
            className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-bold text-white"
            style={{ background: "var(--store-primary)" }}
          >
            {i + 1}
          </span>
          <span className="leading-snug">{it}</span>
        </li>
      ))}
    </ol>
  );
}

export default function PixPaymentModal({
  open,
  onClose,
  pixKey,
  pixName,
  city,
  amount,
  orderCode,
  onPaid,
}: Props) {
  const { showToast } = useToast();
  const [qr, setQr] = useState("");
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const payload = useMemo(
    () => buildPixPayload({ key: pixKey, name: pixName, city, amount, orderCode }),
    [pixKey, pixName, city, amount, orderCode]
  );

  // QR gerado só quando o modal abre (import dinâmico p/ não pesar o bundle inicial).
  useEffect(() => {
    if (!open || !payload) {
      setQr("");
      return;
    }
    let alive = true;
    // Import do build de browser do `qrcode` (canvas): o `browser` field do pacote
    // é inválido, então o `import("qrcode")` puxaria o build Node e falharia aqui.
    // @ts-expect-error — o subpath do browser não tem tipos próprios.
    import("qrcode/lib/browser")
      .then((mod: unknown) => {
        const q = ((mod as { default?: QrModule }).default ??
          (mod as QrModule)) as QrModule;
        return q.toDataURL(payload, { width: 320, margin: 1 });
      })
      .then((url) => {
        if (alive) setQr(url);
      })
      .catch(() => {
        if (alive) setQr("");
      });
    return () => {
      alive = false;
    };
  }, [open, payload]);

  // Esc fecha + trava a rolagem do fundo.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  async function handleCopy(
    text: string,
    setFlag: (v: boolean) => void,
    label: string
  ) {
    const ok = await copyText(text);
    if (ok) {
      setFlag(true);
      showToast(`${label} copiada!`);
      window.setTimeout(() => setFlag(false), 1800);
    } else {
      showToast(`Não foi possível copiar ${label.toLowerCase()}`, "error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Pagamento PIX"
    >
      <div
        className="vw-pop-in relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ outlineColor: "var(--store-primary)" }}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <h2 className="text-center text-lg font-semibold text-slate-800">
          Pagamento PIX
        </h2>

        {/* Chave / titular / valor */}
        <div className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-500">Chave PIX:</span>
            <span className="font-medium text-slate-800 break-all">{pixKey}</span>
            <button
              type="button"
              onClick={() => handleCopy(pixKey, setCopiedKey, "Chave")}
              className="inline-flex items-center gap-1 text-xs font-medium"
              style={{ color: "var(--store-primary)" }}
            >
              {copiedKey ? "✓ copiada" : "⧉ copiar"}
            </button>
          </p>
          {pixName.trim() && (
            <p className="mt-1">
              <span className="text-slate-500">Titular:</span>{" "}
              <span className="font-medium text-slate-800">{pixName}</span>
            </p>
          )}
          <p className="mt-1">
            <span className="text-slate-500">Valor:</span>{" "}
            <span className="font-semibold text-slate-800">{money(amount)}</span>
          </p>
        </div>

        {!payload ? (
          <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            A loja ainda não configurou a chave Pix. Fale pelo WhatsApp para
            combinar o pagamento.
          </p>
        ) : (
          <div className="mt-5 grid gap-6 sm:grid-cols-2">
            {/* QR Code */}
            <div>
              <h3 className="mb-3 font-semibold text-slate-800">QR Code</h3>
              <Steps
                items={[
                  "Abra o app do seu banco e entre no menu PIX.",
                  "Escolha a opção “Ler QR Code”.",
                  "Aponte a câmera para o código abaixo e confirme.",
                  "Depois de pagar, envie o comprovante por aqui.",
                ]}
              />
              <div className="mt-4 flex justify-center">
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qr}
                    alt="QR Code do PIX"
                    className="h-44 w-44 rounded-lg border border-slate-200"
                    width={176}
                    height={176}
                  />
                ) : (
                  <div className="flex h-44 w-44 items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400">
                    Gerando…
                  </div>
                )}
              </div>
            </div>

            {/* Copia e cola */}
            <div>
              <h3 className="mb-3 font-semibold text-slate-800">Copia e cola</h3>
              <Steps
                items={[
                  "Copie o código abaixo.",
                  "No app do banco, entre no menu PIX.",
                  "Escolha “PIX Copia e Cola” e cole o código.",
                  "Confirme e finalize; depois envie o comprovante.",
                ]}
              />
              <div className="mt-4 flex items-stretch gap-2">
                <div className="flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
                  {payload}
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(payload, setCopiedCode, "Código")}
                  className="flex-none rounded-lg px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: "var(--store-primary)" }}
                >
                  {copiedCode ? "✓" : "Copiar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Ações */}
        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onPaid}
            className="w-full rounded-full py-3 text-base font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ background: "var(--store-primary)" }}
          >
            Tudo certo, já paguei
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-full border py-3 text-base font-semibold transition-colors hover:bg-slate-50"
            style={{ borderColor: "var(--store-primary)", color: "var(--store-primary)" }}
          >
            Pagar depois
          </button>
        </div>
      </div>
    </div>
  );
}
