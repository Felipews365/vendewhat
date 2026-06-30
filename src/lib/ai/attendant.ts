/**
 * Atendente de IA (OpenAI) para o WhatsApp da loja.
 * Configurar no ambiente:
 *   OPENAI_API_KEY  -> chave da OpenAI
 *   OPENAI_MODEL    -> opcional; default gpt-4o-mini
 */
import OpenAI from "openai";
import type { AiTone, ChatTurn } from "@/lib/whatsappConfig";

export type AttendantProduct = {
  name: string;
  price: number;
  stock: number;
  description: string | null;
  category: string | null;
  isPromotion: boolean;
  compareAtPrice: number | null;
};

export function isAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY não configurada.");
    }
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

const TONE_INSTRUCTION: Record<AiTone, string> = {
  simpatico:
    "Use um tom simpático, acolhedor e prestativo. Trate o cliente com gentileza.",
  formal:
    "Use um tom formal, educado e profissional. Evite gírias e excesso de emojis.",
  descontraido:
    "Use um tom descontraído e leve, com naturalidade e alguns emojis quando fizer sentido.",
};

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatCatalog(products: AttendantProduct[]): string {
  if (products.length === 0) {
    return "(Nenhum produto cadastrado no momento.)";
  }
  return products
    .slice(0, 60)
    .map((p) => {
      const parts = [`- ${p.name}: ${brl(p.price)}`];
      if (p.isPromotion && p.compareAtPrice && p.compareAtPrice > p.price) {
        parts.push(`(promoção, de ${brl(p.compareAtPrice)})`);
      }
      if (p.category) parts.push(`[${p.category}]`);
      parts.push(p.stock > 0 ? "— disponível" : "— sem estoque");
      if (p.description) {
        const desc = p.description.replace(/\s+/g, " ").trim().slice(0, 140);
        if (desc) parts.push(`— ${desc}`);
      }
      return parts.join(" ");
    })
    .join("\n");
}

export function buildSystemPrompt(args: {
  storeName: string;
  slug: string;
  faq: string;
  aiName: string;
  aiTone: AiTone;
  products: AttendantProduct[];
  baseUrl: string;
  isFirstContact: boolean;
}): string {
  const { storeName, slug, faq, aiName, aiTone, products, baseUrl, isFirstContact } =
    args;
  const storeUrl = `${baseUrl.replace(/\/+$/, "")}/loja/${slug}`;

  return [
    `Você é ${aiName}, atendente virtual da loja "${storeName}" no WhatsApp.`,
    TONE_INSTRUCTION[aiTone],
    "",
    "Seu objetivo é atender os clientes, tirar todas as dúvidas e incentivar a compra.",
    `Sempre que o cliente demonstrar interesse em comprar, ou pedir o link, envie o link da loja para ele finalizar o pedido pelo site: ${storeUrl}`,
    "",
    "Regras:",
    isFirstContact
      ? `- Esta é a PRIMEIRA mensagem deste cliente. Comece a resposta se apresentando: diga que você é ${aiName}, da loja "${storeName}", e só depois responda o que ele perguntou. Apresente-se apenas uma vez, neste primeiro contato.`
      : "- Você já se apresentou antes nesta conversa. NÃO repita a apresentação; vá direto ao ponto.",
    "- Responda APENAS sobre esta loja, seus produtos e o atendimento. Recuse educadamente assuntos não relacionados.",
    "- Baseie preços e disponibilidade na lista de produtos e nas informações abaixo. Não invente produtos, preços ou políticas.",
    "- Se não souber algo, diga que vai verificar com a loja em vez de inventar.",
    "- Seja objetivo: respostas curtas, próprias para WhatsApp.",
    "- Não prometa descontos ou condições que não estejam nas informações fornecidas.",
    "",
    "PRODUTOS DA LOJA:",
    formatCatalog(products),
    "",
    "INFORMAÇÕES / POLÍTICAS DA LOJA (FAQ):",
    faq.trim() ? faq.trim() : "(Sem informações adicionais cadastradas.)",
  ].join("\n");
}

/** Gera a resposta do atendente. Retorna o texto, ou null se não houver conteúdo. */
export async function generateReply(
  systemPrompt: string,
  history: ChatTurn[],
  userMessage: string
): Promise<string | null> {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const completion = await getClient().chat.completions.create({
    model,
    max_tokens: 400,
    messages: [
      { role: "system", content: systemPrompt },
      ...history.map((t) => ({ role: t.role, content: t.content })),
      { role: "user", content: userMessage },
    ],
  });
  const text = completion.choices[0]?.message?.content;
  return text ? text.trim() : null;
}
