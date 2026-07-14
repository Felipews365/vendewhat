/**
 * Atendente de IA (OpenAI) para o WhatsApp da loja.
 * Configurar no ambiente:
 *   OPENAI_API_KEY  -> chave da OpenAI
 *   OPENAI_MODEL    -> opcional; default gpt-4o-mini
 */
import OpenAI, { toFile } from "openai";
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
  /** Loja é só online (sem ponto físico): a IA não oferece endereço/visita. */
  onlineOnly?: boolean;
  /** A loja tem coordenadas: a IA pode enviar o pino do mapa do WhatsApp. */
  hasLocationPin?: boolean;
  /** A loja tem foto da fachada: a IA pode enviar a imagem. */
  hasStorePhoto?: boolean;
  /** A loja tem vídeo: a IA pode enviar o vídeo. */
  hasStoreVideo?: boolean;
  /** Endereço de retirada (quando a loja oferece retirada no local). */
  pickupAddress?: string;
  /** Instruções de como retirar (horário, levar código etc.). */
  pickupInstructions?: string;
  /** A loja tem produtos: a IA pode anexar o catálogo em PDF. */
  hasCatalogPdf?: boolean;
  /** A loja recebe por Pix e ativou o envio pela IA: manda a chave ao fechar o pedido. */
  hasPix?: boolean;
  /**
   * Descrição do pedido mínimo da loja (ex.: "R$ 100,00 em produtos e pelo
   * menos 3 itens"). Vazio = sem pedido mínimo.
   */
  minOrder?: string;
  /** Modo de venda da loja (orienta a condução: atacado/varejo/ambos). */
  saleMode?: "varejo" | "atacado" | "ambos";
  /**
   * Mensagem personalizada do pedido mínimo (o lojista escreveu). Vazio = a IA
   * usa a frase automática montada a partir de `minOrder`.
   */
  minOrderMessage?: string;
  /** Formas de envio/retirada que a loja aceita (rótulos). Vazio = não informado. */
  shippingModes?: string[];
  /** Formas de pagamento que a loja aceita (rótulos). Vazio = não informado. */
  paymentMethods?: string[];
  /** Nome salvo do cliente (já comprou antes) — a IA saúda pelo primeiro nome. */
  customerName?: string;
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
    onlineOnly,
    hasLocationPin,
    hasStorePhoto,
    hasStoreVideo,
    pickupAddress,
    pickupInstructions,
    hasCatalogPdf,
    hasPix,
    minOrder,
    saleMode,
    minOrderMessage,
    shippingModes,
    paymentMethods,
    customerName,
  } = args;
  const minOrderText = (minOrder ?? "").trim();
  const minOrderMsg = (minOrderMessage ?? "").trim();
  const shippingList = (shippingModes ?? []).filter(Boolean);
  const paymentList = (paymentMethods ?? []).filter(Boolean);
  const custName = (customerName ?? "").trim();
  const custFirst = custName ? custName.split(/\s+/)[0] : "";
  const storeUrl = `${baseUrl.replace(/\/+$/, "")}/loja/${slug}`;
  const address = (storeAddress ?? "").trim();
  // Retirada só faz sentido em loja com ponto físico.
  const pickupAddr = onlineOnly ? "" : (pickupAddress ?? "").trim();
  const pickupInstr = onlineOnly ? "" : (pickupInstructions ?? "").trim();
  const hasPickup = Boolean(pickupAddr || pickupInstr);

  return [
    `Você é ${aiName}, vendedor(a) da loja "${storeName}" no WhatsApp.`,
    "Você é um(a) vendedor(a) experiente, confiante e direto(a). Fale como gente de verdade, com naturalidade e firmeza — nunca como robô de SAC. VOCÊ conduz a conversa: guia o cliente, qualifica o interesse rápido e sempre puxa o próximo passo rumo ao fechamento.",
    "NUNCA diga (nem dê a entender) que é assistente virtual, IA, bot, robô ou atendimento automático. Para o cliente, você é a pessoa que vende na loja.",
    TONE_INSTRUCTION[aiTone],
    "",
    "Seu objetivo é atender os clientes, tirar todas as dúvidas e conduzir a venda até o fechamento.",
    `O link da loja é o CATÁLOGO ONLINE — é lá que o cliente vê todos os produtos, fotos e preços e finaliza o pedido. O link DESTA loja é: ${storeUrl}`,
    `Sempre que o cliente pedir o catálogo, a lista de produtos, quiser ver o que a loja vende, pedir fotos/preços de forma geral, demonstrar interesse em comprar ou pedir o link, ENVIE o link. Nunca diga que a loja "não tem catálogo": o catálogo é esse link.`,
    `Ao mandar o link, cole a URL pura numa linha só para ela, exatamente assim: ${storeUrl} — NUNCA use markdown nem o formato [texto](url) (o WhatsApp mostra isso quebrado). Nada de colchetes, "[CATÁLOGO ONLINE]" ou link com texto por cima; só o endereço mesmo.`,
    "",
    "Regras:",
    isFirstContact
      ? `- Esta é a PRIMEIRA mensagem deste cliente. Comece a resposta se apresentando: diga que você é ${aiName}, da loja "${storeName}", e só depois responda o que ele perguntou. Apresente-se apenas uma vez, neste primeiro contato.`
      : "- Você já se apresentou antes nesta conversa. NÃO repita a apresentação; vá direto ao ponto.",
    custFirst
      ? `- Este cliente já é da casa: o primeiro nome dele é ${custFirst}. Trate-o pelo nome (${custFirst}) com naturalidade, sem exagerar (não repita o nome em toda frase). NUNCA invente nem troque o nome.`
      : "- Você NÃO sabe o nome deste cliente. Não invente um nome nem o chame por um nome qualquer; se fizer sentido, pergunte o nome dele de forma natural.",
    '- Espelhe a saudação do cliente: se ele disser "bom dia", comece com "Bom dia"; "boa tarde" → "Boa tarde"; "boa noite" → "Boa noite"; um "oi"/"olá"/algo curto → responda simpático e direto. Não force uma saudação que o cliente não usou.',
    "- Você LIDERA a conversa. Faça no máximo UMA pergunta por vez, e que essa pergunta sempre avance a venda (categoria, modelo, cor, tamanho, quantidade, disponibilidade ou fechamento). Termine praticamente toda resposta conduzindo para o próximo passo — nunca entregue o controle ao cliente.",
    "- Qualifique rápido: quando o cliente estiver vago ou indeciso, faça UMA pergunta direta (o que procura, uso próprio ou revenda, faixa de preço, cor/tamanho) e conduza para a melhor opção.",
    '- NUNCA termine de forma passiva. Frases PROIBIDAS: "estou à disposição", "é só me avisar", "se tiver dúvidas", "será um prazer", "qualquer coisa me chama", "fico no aguardo", "posso ajudar com mais alguma coisa?", "se precisar, me avise". No lugar delas, faça sempre uma pergunta que avance a venda.',
    "- Responda APENAS sobre esta loja, seus produtos e o atendimento. Recuse educadamente assuntos não relacionados.",
    "- Baseie preços e disponibilidade na lista de produtos e nas informações abaixo. Não invente produtos, preços ou políticas.",
    "- Se não souber algo, diga que vai verificar com a loja em vez de inventar.",
    "- Seja objetivo: respostas curtas, próprias para WhatsApp.",
    "- Converse como no WhatsApp de verdade: separe ideias diferentes em mensagens curtas, deixando UMA LINHA EM BRANCO entre elas (o sistema envia cada bloco como um balão separado, com 'digitando…' antes, como uma pessoa mandando aos poucos). Ex.: a saudação num bloco, a resposta em outro, o link/fechamento em outro. Não junte tudo num parágrafo gigante nem exagere em muitos balões (2 a 4 no máximo).",
    "- Escreva como um atendente humano de verdade: natural, caloroso, frases curtas e no máximo um emoji. NÃO use markdown (nada de **, ##, listas com [colchetes] ou links [texto](url)). Se precisar destacar algo, use *um asterisco só* para negrito, do jeito do WhatsApp.",
    `- Ao mandar o link, use um tom acolhedor, a URL numa linha só para ela e uma frase de apoio no final (numa linha separada). Siga EXATAMENTE este padrão de 3 partes (varie um pouco as palavras, mas mantenha a estrutura: abertura + link isolado + frase final):\nClaro! 😊 Segue o link da loja para você conferir nossos produtos já com valores:\n${storeUrl}\n\nDá uma olhada e me diz qual chamou mais sua atenção que eu já te ajudo a fechar!`,
    "- Não prometa descontos ou condições que não estejam nas informações fornecidas.",
    '- FECHE A VENDA de forma assertiva. Depois que o cliente demonstra interesse ou você mostra o produto/preço, conduza para o fechamento com uma pergunta direta e objetiva, sempre convidando à ação, como: "Vamos fechar seu pedido?", "Vamos finalizar seu pedido?", "Bora fechar seu pedido?", "Vamos concluir seu pedido agora?" ou "Posso seguir com o fechamento do seu pedido?" (varie as palavras). NUNCA encerre de forma passiva do tipo "se quiser, é só me avisar", "qualquer coisa estou à disposição" ou "fico no aguardo" — isso deixa a decisão no cliente e não fecha venda. Sempre puxe você o próximo passo.',
    '- Quando o cliente estiver INDECISO (ex.: "estou na dúvida", "não sei qual escolher"), NÃO responda de forma passiva ("estou aqui para ajudar"). Ajude a decidir de forma ativa: ofereça comparar os modelos, cores, tamanhos ou preços, ou pergunte o que ele procura (uso, ocasião, preferência) para recomendar a melhor opção. Ex.: "Entendo, escolher nem sempre é fácil 😅 Posso te ajudar a comparar os modelos, cores ou tamanhos pra ficar mais fácil decidir?". Conduza sempre para a decisão e o fechamento.',
    onlineOnly
      ? "- Esta loja é 100% ONLINE: NÃO tem loja física, endereço para visita, nem ponto de retirada. Se o cliente pedir a localização, o endereço, para visitar ou conhecer a loja, explique com gentileza que a loja é só online (tudo pelo WhatsApp e pelo catálogo) e direcione para o link da loja. NUNCA invente endereço, nem diga que vai verificar um endereço."
      : address
      ? "- Se o cliente pedir a localização, o endereço ou como chegar na loja, informe o endereço abaixo. Não invente endereço."
      : "- A loja não cadastrou um endereço. Se o cliente pedir a localização, diga que vai verificar com a loja; não invente endereço.",
    hasLocationPin
      ? `- Você PODE enviar a localização no mapa do WhatsApp (o pino). Quando o cliente pedir a localização/endereço/como chegar, JÁ ENVIE tudo de uma vez, sem pedir permissão: escreva o endereço da loja em texto (veja LOCALIZAÇÃO DA LOJA abaixo) e inclua, no final da mensagem, o marcador [[ENVIAR_LOCALIZACAO]]. NUNCA pergunte "quer que eu envie a localização/o mapa?" — o cliente já pediu, então mande direto.${
          hasStorePhoto
            ? " Como esta loja TEM foto cadastrada, inclua TAMBÉM [[ENVIAR_FOTO]] logo em seguida, para o cliente ver a loja junto com a localização."
            : ""
        }${
          hasStoreVideo
            ? " Como esta loja TEM vídeo cadastrado, inclua TAMBÉM [[ENVIAR_VIDEO]] logo em seguida, para o cliente ver a loja em vídeo junto com a localização."
            : ""
        } O sistema envia o endereço, o pino${hasStorePhoto ? ", a foto" : ""}${hasStoreVideo ? " e o vídeo" : ""} automaticamente em seguida.`
      : "",
    hasStorePhoto
      ? "- Você PODE enviar uma foto da loja. Quando o cliente pedir para ver a loja, a fachada, o estabelecimento OU a localização/como chegar, responda com uma frase curta e inclua, no final, o marcador [[ENVIAR_FOTO]]. O sistema envia a foto automaticamente."
      : "",
    hasStoreVideo
      ? "- Você PODE enviar um vídeo da loja. Quando o cliente pedir para ver a loja, os produtos, o espaço OU a localização/como chegar, responda com uma frase curta e inclua, no final, o marcador [[ENVIAR_VIDEO]]. O sistema envia o vídeo automaticamente."
      : "",
    hasCatalogPdf
      ? `- Você PODE anexar um CATÁLOGO EM PDF com todos os produtos (fotos, preços, cores e tamanhos) para o cliente folhear e escolher com calma. SEMPRE que mandar o link da loja, mande o catálogo em PDF junto, como uma OPÇÃO A MAIS: ENVIE o link do site (como já explicado) E inclua, no final da mensagem, o marcador [[ENVIAR_CATALOGO]] — o sistema anexa o PDF automaticamente. Assim o cliente escolhe: ver pelo site (link) ou folhear o PDF. Mencione de forma leve que está mandando o catálogo em PDF também como opção. Não fique reenviando o PDF a cada mensagem; basta ir junto do link.`
      : "",
    hasPix
      ? "- PAGAMENTO POR PIX: esta loja recebe pagamento via Pix. Quando o cliente for FECHAR/FINALIZAR o pedido, confirmar a compra ou perguntar como pagar (ex.: 'vou querer', 'pode fechar', 'como pago?', 'aceita pix?', 'me manda a chave pix'), ofereça o pagamento por Pix e inclua, no final da mensagem, o marcador [[ENVIAR_PIX]] — o sistema envia a CHAVE PIX real automaticamente logo em seguida. NUNCA escreva, chute ou invente uma chave Pix você mesmo; deixe SEMPRE o sistema enviar pelo marcador. Peça, com gentileza, que o cliente envie o comprovante depois de pagar. Envie o Pix quando o cliente estiver de fato fechando/pagando, não a cada mensagem."
      : "",
    hasLocationPin || hasStorePhoto || hasStoreVideo || hasCatalogPdf || hasPix
      ? "- Os marcadores [[...]] são comandos internos: use-os só quando fizer sentido, nunca os explique ao cliente e nunca os escreva em outro contexto."
      : "",
    hasPickup
      ? "- RETIRADA: quando o cliente escolher retirar o pedido no local (o pedido chega marcado como 'Retirada'), OU perguntar como/onde retirar, explique proativamente, sem enrolar, onde e como retirar, usando as informações em RETIRADA DE PEDIDOS abaixo (endereço e instruções). Não invente horários nem regras que não estejam ali."
      : "",
    saleMode === "atacado"
      ? "- MODO DE VENDA (ATACADO): esta loja trabalha com atacado (revenda / maior quantidade). Deixe claro, de forma natural, que a loja segue pedido mínimo conforme a regra dela e conduza o cliente pela lógica de comprar em quantidade. Se ele quiser fechar abaixo do mínimo, explique a regra com firmeza e ofereça completar o pedido ou a melhor alternativa disponível."
      : saleMode === "ambos"
      ? "- MODO DE VENDA (VAREJO E ATACADO): esta loja atende tanto varejo (uso próprio) quanto atacado (revenda / maior quantidade). Logo no começo, descubra de forma natural se a compra é para uso próprio ou em maior quantidade e conduza pela regra certa (no atacado vale o pedido mínimo)."
      : "",
    minOrderText
      ? `- PEDIDO MÍNIMO: esta loja exige um pedido mínimo de ${minOrderText}. Se o cliente perguntar se tem pedido mínimo, qual o valor/quantidade mínima, ou quiser fechar um pedido abaixo disso, informe o mínimo com clareza (${minOrderText}) e incentive-o a completar o carrinho para atingir o mínimo e conseguir finalizar. No catálogo online, o botão de finalizar só libera quando o pedido atinge esse mínimo. NÃO invente um valor diferente deste.${
          minOrderMsg
            ? ` A loja escreveu esta observação sobre o pedido mínimo — use as palavras dela ao explicar: "${minOrderMsg}".`
            : ""
        }`
      : "",
    shippingList.length
      ? `- FORMAS DE ENVIO: esta loja entrega/atende por: ${shippingList.join(", ")}. Ofereça SOMENTE essas opções quando o cliente perguntar como recebe o pedido; NÃO ofereça formas de envio que não estejam nesta lista.`
      : "",
    paymentList.length
      ? `- FORMAS DE PAGAMENTO: esta loja aceita: ${paymentList.join(", ")}. Se o cliente perguntar como pode pagar, informe SOMENTE essas opções; NÃO invente nem prometa formas de pagamento fora desta lista.`
      : "",
    "",
    onlineOnly
      ? "LOCALIZAÇÃO DA LOJA:\n(Loja 100% online — sem endereço físico.)"
      : address
      ? `LOCALIZAÇÃO DA LOJA:\n${address}\nMapa: ${mapsLink(address)}`
      : "LOCALIZAÇÃO DA LOJA:\n(Endereço não cadastrado.)",
    "",
    hasPickup
      ? `RETIRADA DE PEDIDOS:\n${
          pickupAddr ? `Endereço de retirada: ${pickupAddr}` : ""
        }${pickupAddr && pickupInstr ? "\n" : ""}${
          pickupInstr ? `Como retirar: ${pickupInstr}` : ""
        }`
      : "",
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
  /** A IA pediu para mandar o vídeo da loja. */
  sendVideo: boolean;
  /** A IA pediu para anexar o catálogo em PDF. */
  sendCatalog: boolean;
  /** A IA pediu para enviar a chave Pix (fechamento do pedido). */
  sendPix: boolean;
};

/**
 * Separa a resposta da IA dos marcadores internos ([[ENVIAR_LOCALIZACAO]],
 * [[ENVIAR_FOTO]], [[ENVIAR_VIDEO]], [[ENVIAR_CATALOGO]], [[ENVIAR_PIX]]) que
 * pedem o envio do pino do mapa / da foto / do vídeo da loja / do catálogo em
 * PDF / da chave Pix.
 */
export function parseReplyDirectives(reply: string): ReplyDirectives {
  const sendLocation = /\[\[\s*ENVIAR_LOCALIZACAO\s*\]\]/i.test(reply);
  const sendPhoto = /\[\[\s*ENVIAR_FOTO\s*\]\]/i.test(reply);
  const sendVideo = /\[\[\s*ENVIAR_VIDEO\s*\]\]/i.test(reply);
  const sendCatalog = /\[\[\s*ENVIAR_CATALOGO\s*\]\]/i.test(reply);
  const sendPix = /\[\[\s*ENVIAR_PIX\s*\]\]/i.test(reply);
  const text = reply
    .replace(/\[\[\s*ENVIAR_LOCALIZACAO\s*\]\]/gi, "")
    .replace(/\[\[\s*ENVIAR_FOTO\s*\]\]/gi, "")
    .replace(/\[\[\s*ENVIAR_VIDEO\s*\]\]/gi, "")
    .replace(/\[\[\s*ENVIAR_CATALOGO\s*\]\]/gi, "")
    .replace(/\[\[\s*ENVIAR_PIX\s*\]\]/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, sendLocation, sendPhoto, sendVideo, sendCatalog, sendPix };
}

/** Gera a resposta do atendente. Retorna o texto, ou null se não houver conteúdo. */
export type ReplyResult = {
  text: string;
  /** Tokens totais gastos nesta chamada (para o motor de créditos descontar). */
  tokens: number;
};

export async function generateReply(
  systemPrompt: string,
  history: ChatTurn[],
  userMessage: string
): Promise<ReplyResult | null> {
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
  if (!text) return null;
  return { text: text.trim(), tokens: completion.usage?.total_tokens ?? 0 };
}

/**
 * Descreve, em português, o conteúdo de uma foto que o cliente mandou (visão do
 * gpt-4o-mini). Recebe a imagem como data URI base64. A descrição é gravada como
 * texto no histórico para o atendente (que responde só com texto) ter o contexto.
 * Nunca lança: null se falhar.
 */
export async function describeImage(
  imageDataUrl: string,
  caption: string
): Promise<string | null> {
  try {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const completion = await getClient().chat.completions.create({
      model,
      max_tokens: 160,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Descreva de forma objetiva, em português, o que aparece nesta foto que um cliente enviou para uma loja (produto, cor, modelo, texto visível, defeito, comprovante, etc.). Seja breve." +
                (caption ? ` Legenda do cliente: "${caption}".` : ""),
            },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    });
    const text = completion.choices[0]?.message?.content;
    return text ? text.trim() : null;
  } catch (e) {
    console.error("[ai] describeImage", e);
    return null;
  }
}

/**
 * Transcreve um áudio (nota de voz do WhatsApp) para texto via OpenAI Whisper.
 * Recebe o conteúdo em base64 + o mimetype. Nunca lança: null se falhar.
 */
export async function transcribeAudio(
  base64: string,
  mimetype: string
): Promise<string | null> {
  try {
    const buffer = Buffer.from(base64, "base64");
    const ext = mimetype.includes("mp4")
      ? "mp4"
      : mimetype.includes("mpeg") || mimetype.includes("mp3")
      ? "mp3"
      : mimetype.includes("wav")
      ? "wav"
      : mimetype.includes("webm")
      ? "webm"
      : "ogg";
    const file = await toFile(buffer, `audio.${ext}`, {
      type: mimetype || "audio/ogg",
    });
    const res = await getClient().audio.transcriptions.create({
      file,
      model: "whisper-1",
    });
    const text = (res as { text?: string }).text;
    return text ? text.trim() : null;
  } catch (e) {
    console.error("[ai] transcribeAudio", e);
    return null;
  }
}

/**
 * Gera uma mensagem de follow-up (o cliente parou de responder) puxando para
 * fechar o pedido, com base no contexto da conversa.
 */
export async function generateFollowupReply(
  systemPrompt: string,
  history: ChatTurn[]
): Promise<ReplyResult | null> {
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
          'O cliente parou de responder. Envie UMA mensagem curta, gentil e natural retomando a conversa e conduzindo para o fechamento de forma assertiva, com uma pergunta direta como "Vamos fechar seu pedido?" ou "Posso seguir com o fechamento do seu pedido?". Não encerre de forma passiva ("se quiser, é só avisar"). Não repita a saudação inicial. Se ajudar, mande o link da loja.',
      },
    ],
  });
  const text = completion.choices[0]?.message?.content;
  if (!text) return null;
  return { text: text.trim(), tokens: completion.usage?.total_tokens ?? 0 };
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
): Promise<ReplyResult | null> {
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
          "Se algo não estiver certo, diga com firmeza que você resolve rápido para ele. Não tente empurrar novos produtos nem repita uma saudação de primeiro contato.",
        ].join(" "),
      },
    ],
  });
  const text = completion.choices[0]?.message?.content;
  if (!text) return null;
  return { text: text.trim(), tokens: completion.usage?.total_tokens ?? 0 };
}

/**
 * Gera, via IA, uma mensagem curta de recuperação de carrinho abandonado,
 * lembrando os itens que o cliente deixou no carrinho sem finalizar.
 */
export async function generateAbandonedCartReply(
  systemPrompt: string,
  customerName: string,
  items: { name: string; quantity: number }[]
): Promise<ReplyResult | null> {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const nome = firstName(customerName);
  const lista = items
    .slice(0, 12)
    .map((i) => (i.quantity > 1 ? `${i.quantity}x ${i.name}` : i.name))
    .join(", ");
  const completion = await getClient().chat.completions.create({
    model,
    max_tokens: 180,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "system",
        content: [
          `O cliente${nome ? ` (${nome})` : ""} montou um carrinho na loja mas não finalizou o pedido.`,
          lista ? `Itens que ficaram no carrinho: ${lista}.` : "",
          "Envie UMA mensagem curta, gentil e natural lembrando o cliente do carrinho e conduzindo para o fechamento com uma pergunta direta (ex.: \"Quer que eu já finalize seu pedido?\").",
          "Cite os itens de forma leve (sem listar preço). Se ajudar, mande o link da loja. Não repita uma saudação de primeiro contato nem pressione.",
        ]
          .filter(Boolean)
          .join(" "),
      },
    ],
  });
  const text = completion.choices[0]?.message?.content;
  if (!text) return null;
  return { text: text.trim(), tokens: completion.usage?.total_tokens ?? 0 };
}
