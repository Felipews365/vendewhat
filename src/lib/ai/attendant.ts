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

/** Monta um link do Google Maps a partir de um endereço em texto. */
function mapsLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address
  )}`;
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
  /** Endereço/localização da loja; vazio = não informado. */
  storeAddress?: string;
  /** A loja tem coordenadas: a IA pode enviar o pino do mapa do WhatsApp. */
  hasLocationPin?: boolean;
  /** A loja tem foto da fachada: a IA pode enviar a imagem. */
  hasStorePhoto?: boolean;
}): string {
  const {
    storeName,
    slug,
    faq,
    aiName,
    aiTone,
    products,
    baseUrl,
    isFirstContact,
    storeAddress,
    hasLocationPin,
    hasStorePhoto,
  } = args;
  const storeUrl = `${baseUrl.replace(/\/+$/, "")}/loja/${slug}`;
  const address = (storeAddress ?? "").trim();

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
    address
      ? "- Se o cliente pedir a localização, o endereço ou como chegar na loja, informe o endereço abaixo. Não invente endereço."
      : "- A loja não cadastrou um endereço. Se o cliente pedir a localização, diga que vai verificar com a loja; não invente endereço.",
    hasLocationPin
      ? "- Você PODE enviar a localização no mapa do WhatsApp (o pino). Quando o cliente pedir a localização/endereço/como chegar, responda com uma frase curta e inclua, no final da mensagem, o marcador [[ENVIAR_LOCALIZACAO]]. O sistema envia o pino do mapa automaticamente em seguida."
      : "",
    hasStorePhoto
      ? "- Você PODE enviar uma foto da loja. Quando o cliente pedir para ver a loja, a fachada ou o estabelecimento, responda com uma frase curta e inclua, no final, o marcador [[ENVIAR_FOTO]]. O sistema envia a foto automaticamente."
      : "",
    hasLocationPin || hasStorePhoto
      ? "- Os marcadores [[...]] são comandos internos: use-os só quando fizer sentido, nunca os explique ao cliente e nunca os escreva em outro contexto."
      : "",
    "",
    address
      ? `LOCALIZAÇÃO DA LOJA:\n${address}\nMapa: ${mapsLink(address)}`
      : "LOCALIZAÇÃO DA LOJA:\n(Endereço não cadastrado.)",
    "",
    "PRODUTOS DA LOJA:",
    formatCatalog(products),
    "",
    "INFORMAÇÕES / POLÍTICAS DA LOJA (FAQ):",
    faq.trim() ? faq.trim() : "(Sem informações adicionais cadastradas.)",
  ].join("\n");
}

export type ReplyDirectives = {
  /** Texto a enviar, já sem os marcadores internos. */
  text: string;
  /** A IA pediu para mandar o pino da localização. */
  sendLocation: boolean;
  /** A IA pediu para mandar a foto da loja. */
  sendPhoto: boolean;
};

/**
 * Separa a resposta da IA dos marcadores internos ([[ENVIAR_LOCALIZACAO]],
 * [[ENVIAR_FOTO]]) que pedem o envio do pino do mapa / da foto da loja.
 */
export function parseReplyDirectives(reply: string): ReplyDirectives {
  const sendLocation = /\[\[\s*ENVIAR_LOCALIZACAO\s*\]\]/i.test(reply);
  const sendPhoto = /\[\[\s*ENVIAR_FOTO\s*\]\]/i.test(reply);
  const text = reply
    .replace(/\[\[\s*ENVIAR_LOCALIZACAO\s*\]\]/gi, "")
    .replace(/\[\[\s*ENVIAR_FOTO\s*\]\]/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, sendLocation, sendPhoto };
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

/**
 * Gera uma mensagem de follow-up (o cliente parou de responder) puxando para
 * fechar o pedido, com base no contexto da conversa.
 */
export async function generateFollowupReply(
  systemPrompt: string,
  history: ChatTurn[]
): Promise<string | null> {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const completion = await getClient().chat.completions.create({
    model,
    max_tokens: 200,
    messages: [
      { role: "system", content: systemPrompt },
      ...history.map((t) => ({ role: t.role, content: t.content })),
      {
        role: "system",
        content:
          "O cliente parou de responder. Envie UMA mensagem curta, gentil e natural retomando a conversa e perguntando se ele quer finalizar o pedido. Não repita a saudação inicial. Se ajudar, ofereça tirar dúvidas ou mande o link da loja.",
      },
    ],
  });
  const text = completion.choices[0]?.message?.content;
  return text ? text.trim() : null;
}

/** Primeiro nome do cliente (para personalizar a mensagem). */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/**
 * Mensagem padrão de pós-venda, usada quando a loja não escreveu uma fixa e a
 * IA não está configurada (ou a geração falhou). Não depende da OpenAI.
 */
export function defaultPostsaleMessage(
  storeName: string,
  customerName: string,
  orderNumber: number | null
): string {
  const nome = firstName(customerName);
  const ola = nome ? `Oi, ${nome}!` : "Oi!";
  const pedido = orderNumber ? ` (pedido #${orderNumber})` : "";
  return `${ola} Aqui é da ${storeName} 😊 Passando para saber se o seu pedido${pedido} chegou certinho e se está tudo bem. Qualquer coisa, é só me chamar!`;
}

/**
 * Gera, via IA, uma mensagem curta de pós-venda perguntando se o pedido chegou
 * certinho. Não usa o histórico da conversa (é sobre o pedido já entregue).
 */
export async function generatePostsaleReply(
  systemPrompt: string,
  customerName: string,
  orderNumber: number | null
): Promise<string | null> {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const nome = firstName(customerName);
  const completion = await getClient().chat.completions.create({
    model,
    max_tokens: 160,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "system",
        content: [
          `O cliente${nome ? ` (${nome})` : ""} fez um pedido${
            orderNumber ? ` (#${orderNumber})` : ""
          } há alguns dias e já deve tê-lo recebido.`,
          "Envie UMA mensagem curta, gentil e natural perguntando se o pedido chegou certinho e se está tudo bem com ele.",
          "Coloque-se à disposição para qualquer problema. Não tente empurrar novos produtos nem repita uma saudação de primeiro contato.",
        ].join(" "),
      },
    ],
  });
  const text = completion.choices[0]?.message?.content;
  return text ? text.trim() : null;
}
