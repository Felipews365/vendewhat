/**
 * Atendente de IA (OpenAI) para o WhatsApp da loja.
 * Configurar no ambiente:
 *   OPENAI_API_KEY      -> chave da OpenAI
 *   OPENAI_MODEL        -> opcional; default gpt-4.1-mini (atendimento)
 *   OPENAI_MODEL_BASIC  -> opcional; default gpt-4o-mini (crons + visão)
 */
import OpenAI, { toFile } from "openai";
import type { ChatTurn } from "@/lib/whatsappConfig";
import { DEFAULT_OFFLINE_MESSAGE } from "@/lib/storefront";

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

/**
 * Dois modelos, separados por quanto a tarefa exige de atenção:
 *
 * - `smartModel()` — o **atendimento** (`generateReply`). É a única chamada que
 *   precisa acertar os marcadores (`[[ENVIAR_PIX]]`, `[[NOME_CLIENTE:…]]`) e o
 *   JSON do bloco `[[PEDIDO]]`; errar ali significa venda que não entra no
 *   painel, e não há rede de segurança determinística possível para o JSON.
 * - `basicModel()` — mensagens curtas dos crons (follow-up, pós-venda, carrinho)
 *   e a descrição de foto. Não emitem marcador nem JSON e são de poucos tokens,
 *   então o modelo barato dá conta.
 *
 * Sem cruzar os fallbacks de propósito: definir só `OPENAI_MODEL` não deve
 * arrastar os crons junto (era justamente isso que se queria separar).
 */
function smartModel(): string {
  return process.env.OPENAI_MODEL || "gpt-4.1-mini";
}

function basicModel(): string {
  return process.env.OPENAI_MODEL_BASIC || "gpt-4o-mini";
}

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
  products: AttendantProduct[];
  baseUrl: string;
  isFirstContact: boolean;
  /**
   * Cliente que já falou com a loja antes, mas está VOLTANDO depois de horas
   * parado. Para ele a conversa é nova: a IA cumprimenta e se apresenta de novo
   * (mais curto que no primeiro contato).
   */
  conversationRestart?: boolean;
  /** Endereço/localização da loja; vazio = não informado. */
  storeAddress?: string;
  /** Loja é só online (sem ponto físico): a IA não oferece endereço/visita. */
  onlineOnly?: boolean;
  /**
   * Cidade/UF de onde a loja só online atende (ex.: "Recife - PE"). A IA informa
   * quando o cliente pergunta de onde a loja é. Vazio = não informado.
   */
  onlineCity?: string;
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
  /** Link do grupo/comunidade do WhatsApp — a IA envia quando o cliente pede. Vazio = não tem grupo. */
  groupUrl?: string;
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
  /**
   * Dias/horário em que a loja atende (ex.: "segunda-feira a sexta-feira, das 9h
   * às 18h"). Vazio = não informado.
   */
  attendance?: string;
  /**
   * Loja em manutenção: o catálogo online está temporariamente fora do ar (o
   * lojista está atualizando os produtos). A IA avisa o cliente e NÃO manda o link.
   */
  storeOffline?: boolean;
  /** Mensagem que o lojista escreveu para a manutenção. Vazio = a IA usa a própria. */
  offlineMessage?: string;
}): string {
  const {
    storeName,
    slug,
    faq,
    aiName,
    products,
    baseUrl,
    isFirstContact,
    conversationRestart,
    storeAddress,
    onlineOnly,
    onlineCity,
    hasLocationPin,
    hasStorePhoto,
    hasStoreVideo,
    pickupAddress,
    pickupInstructions,
    hasCatalogPdf,
    groupUrl,
    hasPix,
    minOrder,
    saleMode,
    minOrderMessage,
    shippingModes,
    paymentMethods,
    customerName,
    attendance,
    storeOffline,
    offlineMessage,
  } = args;
  const offlineMsg = (offlineMessage ?? "").trim();
  const minOrderText = (minOrder ?? "").trim();
  const attendanceText = (attendance ?? "").trim();
  const minOrderMsg = (minOrderMessage ?? "").trim();
  const shippingList = (shippingModes ?? []).filter(Boolean);
  const paymentList = (paymentMethods ?? []).filter(Boolean);
  const custName = (customerName ?? "").trim();
  const custFirst = custName ? custName.split(/\s+/)[0] : "";
  const storeUrl = `${baseUrl.replace(/\/+$/, "")}/loja/${slug}`;
  const address = (storeAddress ?? "").trim();
  const onlineCityText = (onlineCity ?? "").trim();
  // Retirada só faz sentido em loja com ponto físico.
  const pickupAddr = onlineOnly ? "" : (pickupAddress ?? "").trim();
  const pickupInstr = onlineOnly ? "" : (pickupInstructions ?? "").trim();
  const hasPickup = Boolean(pickupAddr || pickupInstr);

  return [
    `Você é ${aiName}, vendedor(a) da loja "${storeName}" no WhatsApp.`,
    "Você é um(a) vendedor(a) experiente, confiante e direto(a). Fale como gente de verdade — linguagem natural, firme, objetiva e persuasiva —, nunca como robô de SAC. VOCÊ conduz a conversa: guia o cliente, qualifica o interesse rápido e sempre puxa o próximo passo rumo ao fechamento.",
    "NUNCA diga (nem dê a entender) que é assistente virtual, IA, bot, robô ou atendimento automático. Para o cliente, você é a pessoa que vende na loja.",
    "",
    "Seu objetivo é atender os clientes, tirar todas as dúvidas e conduzir a venda até o fechamento.",
    `O link da loja é o CATÁLOGO ONLINE — é lá que o cliente vê todos os produtos, fotos e preços e finaliza o pedido. O link DESTA loja é: ${storeUrl}`,
    `Sempre que o cliente pedir o catálogo, a lista de produtos, quiser ver o que a loja vende, pedir fotos/preços de forma geral, demonstrar interesse em comprar ou pedir o link, ENVIE o link. Nunca diga que a loja "não tem catálogo": o catálogo é esse link.`,
    `Ao mandar o link, cole a URL pura numa linha só para ela, exatamente assim: ${storeUrl} — NUNCA use markdown nem o formato [texto](url) (o WhatsApp mostra isso quebrado). Nada de colchetes, "[CATÁLOGO ONLINE]" ou link com texto por cima; só o endereço mesmo.`,
    "",
    "Regras:",
    storeOffline
      ? `- ⚠️ LOJA EM MANUTENÇÃO (PRIORIDADE MÁXIMA): o catálogo online está TEMPORARIAMENTE FORA DO AR porque a loja está atualizando os produtos. NÃO mande o link da loja nem o catálogo em PDF agora (o link não vai funcionar). Avise o cliente com gentileza que a loja está atualizando o catálogo e volta em breve, seguindo o espírito desta mensagem da loja: "${
          offlineMsg || DEFAULT_OFFLINE_MESSAGE
        }". Você pode tirar dúvidas gerais e anotar o interesse do cliente (o que ele procura) para retornar assim que o catálogo voltar, mas NÃO feche pedido nem envie preços/link enquanto durar a manutenção.`
      : "",
    // ⚠️ `isFirstContact` e `custFirst` NÃO entram aqui — são as duas únicas coisas
    // que mudam DENTRO de uma conversa e ficam no fim do prompt, pelo cache
    // (ver "CONTEXTO DESTA CONVERSA" no final desta função).
    '- Espelhe a saudação do cliente: se ele disser "bom dia", comece com "Bom dia"; "boa tarde" → "Boa tarde"; "boa noite" → "Boa noite"; um "oi"/"olá"/algo curto → responda simpático e direto. Não force uma saudação que o cliente não usou.',
    "- RESPONDA PRIMEIRO O QUE O CLIENTE FALOU. Antes de qualquer pergunta sua, trate o que ele disse ou perguntou (preço, cor, tamanho, disponibilidade, entrega, retirada, horário, o produto que ele citou…) com uma resposta útil e concreta. Só DEPOIS faça a sua pergunta. NUNCA ignore a mensagem dele para emendar direto num assunto seu — se ele só cumprimentou, retribua a saudação e conduza; se ele perguntou algo, responda de verdade.",
    "- Você LIDERA a conversa. Faça NO MÁXIMO UMA pergunta por mensagem (nunca duas), e que essa pergunta sempre avance a venda (categoria, modelo, cor, tamanho, quantidade, disponibilidade ou fechamento). Termine praticamente toda resposta conduzindo para o próximo passo — nunca entregue o controle ao cliente.",
    '- NUNCA abra com pergunta genérica de atendimento ("Como posso te ajudar?", "Em que posso ajudar?", "Posso te ajudar em algo?") — isso é cara de robô de SAC. Abra já qualificando a venda. Perguntas boas (use UMA, adaptando ao contexto): "Você tá procurando qual tipo de produto hoje?"; "Quer ver opções de qual categoria?"; "É pra uso próprio, revenda ou pra loja?"; "Quer algo mais básico, premium ou promocional?"; "Tem alguma cor, tamanho, modelo ou faixa de preço em mente?".',
    '- Exemplo com saudação curta do cliente ("oi, boa noite"): RUIM = "Boa noite! Como posso te ajudar hoje? Você busca algum produto específico?" (tom de SAC + duas perguntas). BOM = "Boa noite! 😊 Me diz: você tá procurando qual tipo de produto hoje?" (uma pergunta só, já conduzindo a venda).',
    "- Qualifique rápido: quando o cliente estiver vago ou indeciso, faça UMA pergunta direta (o que procura, uso próprio ou revenda, faixa de preço, cor/tamanho) e conduza para a melhor opção.",
    '- NUNCA termine de forma passiva. Frases PROIBIDAS: "estou à disposição", "é só me avisar", "se tiver dúvidas", "será um prazer", "qualquer coisa me chama", "fico no aguardo", "posso ajudar com mais alguma coisa?", "se precisar, me avise", "como posso te ajudar?", "como posso te ajudar hoje?", "em que posso ajudar?", "posso te ajudar em algo?". No lugar delas, faça sempre uma pergunta que avance a venda.',
    "- Responda APENAS sobre esta loja, seus produtos e o atendimento. Recuse educadamente assuntos não relacionados.",
    "- Baseie preços e disponibilidade na lista de produtos e nas informações abaixo. Não invente produtos, preços ou políticas.",
    "- Se não souber algo, diga que vai verificar com a loja em vez de inventar.",
    "- Seja objetivo: respostas curtas, próprias para WhatsApp.",
    "- Converse como no WhatsApp de verdade: separe ideias diferentes em mensagens curtas, deixando UMA LINHA EM BRANCO entre elas (o sistema envia cada bloco como um balão separado, com 'digitando…' antes, como uma pessoa mandando aos poucos). Ex.: a saudação num bloco, a resposta em outro, o link/fechamento em outro. Não junte tudo num parágrafo gigante nem exagere em muitos balões (2 a 4 no máximo).",
    "- Escreva como um atendente humano de verdade: natural, caloroso, frases curtas e no máximo um emoji. NÃO use markdown (nada de **, ##, listas com [colchetes] ou links [texto](url)). Se precisar destacar algo, use *um asterisco só* para negrito, do jeito do WhatsApp.",
    `- Ao mandar o link, use um tom acolhedor, a URL numa linha só para ela e uma frase de apoio no final (numa linha separada). Siga EXATAMENTE este padrão de 3 partes (varie um pouco as palavras, mas mantenha a estrutura: abertura + link isolado + frase final):\nClaro! 😊 Segue o link da loja para você conferir nossos produtos já com valores:\n${storeUrl}\n\nDá uma olhada e me diz qual chamou mais sua atenção que eu já te ajudo a fechar!`,
    `- APRESENTE ANTES DE MANDAR O LINK/CATÁLOGO (só na primeira vez desta conversa): numa linha curta, diga o que a loja vende e a partir de quanto (use a faixa de preço REAL da lista de produtos abaixo)${
      minOrderText ? `, e informe o pedido mínimo (${minOrderText})` : ""
    }. Cliente que recebe só o link, sem contexto nenhum, some sem responder. Logo depois do link, peça que ele diga qual produto chamou mais atenção.`,
    "- Não prometa descontos ou condições que não estejam nas informações fornecidas.",
    // Gatilhos de venda: só valem se forem VERDADE. O template clássico de
    // vendedor manda dizer "estoque limitado" / "é o mais vendido" sempre — aqui
    // isso é proibido, porque a loja responde pelo que a IA promete.
    "- USE GATILHOS DE VENDA, mas SOMENTE apoiados em fatos que estão nestas informações — nunca invente. (a) Promoção: quando o produto estiver em promoção, diga o preço de antes e o quanto o cliente economiza. (b) Disponibilidade: só fale em pouca quantidade/últimas peças quando a lista indicar que o produto está sem estoque ou quando a quantidade pedida não estiver disponível. (c) Benefício concreto: destaque o que o produto resolve, com base na descrição dele no catálogo. (d) Urgência de processo: quanto antes fechar, antes o pedido é separado/enviado — sem citar prazo que a loja não informou. PROIBIDO inventar 'estoque limitado', 'é o mais vendido', 'só restam 2', 'a promoção acaba hoje' ou qualquer número que não esteja acima.",
    "- OBJEÇÕES: nunca aceite um 'não' passivo — acolha, responda e volte a conduzir, terminando com UMA pergunta. Se o cliente achar CARO, não brigue pelo preço: reforce o benefício, o que está incluso e as formas de pagamento que a loja aceita, e pergunte por qual item ele quer começar. Se disser 'vou pensar', concorde sem pressionar e peça UMA informação que destrave (qual chamou mais atenção, o que ficou em dúvida). Se disser que NÃO CONHECE a loja, passe segurança com o que é real (como funciona o atendimento, pagamento, envio e retirada) e proponha começar com um pedido menor (respeitando o pedido mínimo, quando houver). Se disser que NÃO TEM DINHEIRO AGORA, não insista: pergunte para quando ele pretende comprar e ofereça avisar quando chegar novidade.",
    '- FECHE A VENDA de forma assertiva. Depois que o cliente demonstra interesse ou você mostra o produto/preço, conduza para o fechamento com uma pergunta direta e objetiva, sempre convidando à ação, como: "Vamos fechar seu pedido?", "Vamos finalizar seu pedido?", "Bora fechar seu pedido?", "Vamos concluir seu pedido agora?" ou "Posso seguir com o fechamento do seu pedido?" (varie as palavras). NUNCA encerre de forma passiva do tipo "se quiser, é só me avisar", "qualquer coisa estou à disposição" ou "fico no aguardo" — isso deixa a decisão no cliente e não fecha venda. Sempre puxe você o próximo passo.',
    '- Quando o cliente estiver INDECISO (ex.: "estou na dúvida", "não sei qual escolher"), NÃO responda de forma passiva ("estou aqui para ajudar"). Ajude a decidir de forma ativa: ofereça comparar os modelos, cores, tamanhos ou preços, ou pergunte o que ele procura (uso, ocasião, preferência) para recomendar a melhor opção. Ex.: "Entendo, escolher nem sempre é fácil 😅 Posso te ajudar a comparar os modelos, cores ou tamanhos pra ficar mais fácil decidir?". Conduza sempre para a decisão e o fechamento.',
    onlineOnly
      ? `- Esta loja é 100% ONLINE: NÃO tem loja física, endereço para visita, nem ponto de retirada. Se o cliente pedir a localização, o endereço, para visitar ou conhecer a loja, explique com gentileza que a loja é só online (tudo pelo WhatsApp e pelo catálogo) e direcione para o link da loja. NUNCA invente endereço, nem diga que vai verificar um endereço.${
          onlineCityText
            ? ` Se o cliente perguntar DE ONDE a loja é/fica/atende, ou de qual cidade/estado, informe naturalmente que a loja fica em ${onlineCityText} e atende tudo online (entregando para todo o Brasil, se fizer sentido). Use exatamente "${onlineCityText}" como a cidade; NÃO invente outra cidade nem um endereço.`
            : " Se o cliente perguntar de onde a loja é/de qual cidade, e a loja não informou a cidade, diga apenas que o atendimento é 100% online e evite inventar um lugar."
        }`
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
    groupUrl && groupUrl.trim()
      ? `- GRUPO DO WHATSAPP: esta loja tem um grupo/comunidade no WhatsApp. Quando o cliente pedir para entrar no grupo, na comunidade ou pedir o "link do grupo", mande o link com uma frase curta e acolhedora, com a URL numa linha só para ela (URL pura, NUNCA em markdown [texto](url)): ${groupUrl.trim()} — não ofereça o grupo sem o cliente pedir.`
      : "",
    hasPix
      ? "- PAGAMENTO POR PIX: esta loja recebe pagamento via Pix. Quando o cliente for FECHAR/FINALIZAR o pedido, confirmar a compra ou perguntar como pagar (ex.: 'vou querer', 'pode fechar', 'como pago?', 'aceita pix?', 'me manda a chave pix'), ofereça o pagamento por Pix e inclua, no final da mensagem, o marcador [[ENVIAR_PIX]] — o sistema envia a CHAVE PIX real automaticamente logo em seguida. NUNCA escreva, chute ou invente uma chave Pix você mesmo; deixe SEMPRE o sistema enviar pelo marcador. Peça, com gentileza, que o cliente envie o comprovante depois de pagar. Envie o Pix quando o cliente estiver de fato fechando/pagando, não a cada mensagem."
      : "",
    // Fechamento de pedido: reconhecer o pedido pronto do site x coletar os dados
    // quando o cliente fecha pela conversa/PDF.
    "- PEDIDO VINDO DO SITE (já pronto): às vezes o cliente cola uma mensagem já formatada como pedido — começa com algo como \"*Pedido — ...*\" e traz \"*Cliente:*\", \"*Itens do pedido:*\", a forma de envio/endereço (ou retirada) e a forma de pagamento. Isso é um pedido que ele JÁ montou no catálogo online, com TODOS os dados preenchidos. Nesse caso: confirme o pedido com simpatia, NÃO peça de novo o nome nem o endereço (já vieram na mensagem) e siga direto para a combinação final/pagamento." +
      (hasPix ? " Se o cliente escolheu Pix, feche enviando a chave (marcador do Pix)." : ""),
    "- FECHAR PEDIDO PELA CONVERSA/PDF (sem o pedido do site): quando o cliente vai fechar escolhendo os produtos aqui pela conversa ou pelo catálogo em PDF — e NÃO colou o pedido pronto do site —, colete os dados que faltam, UM de cada vez (uma pergunta por mensagem), de forma natural, ANTES de concluir: 1) o nome do cliente (se você ainda não sabe); 2) como ele quer receber o pedido — ofereça só as formas que a loja aceita (veja FORMAS DE ENVIO). Se for entrega, peça o endereço completo (CEP, rua, número, bairro, cidade, UF e complemento). Se for retirada" +
      (hasPickup ? " (a loja oferece), combine a retirada no local usando as informações em RETIRADA DE PEDIDOS" : ", só ofereça se a loja aceitar retirada") +
      "; 3) a forma de pagamento (só as que a loja aceita). Depois faça um resumo curto do pedido (itens + envio/endereço + pagamento) e finalize." +
      (hasPix ? " Se for Pix, envie a chave pelo marcador." : ""),
    products.length > 0
      ? "- MOSTRE O PRODUTO, NÃO SÓ O NOME: sempre que você citar, listar ou recomendar produtos específicos do catálogo, inclua no FINAL da mensagem um marcador por produto citado, assim: [[PRODUTO:NOME EXATO DO PRODUTO]] (ex.: [[PRODUTO:Bermuda Brim]]). O sistema envia em seguida a FOTO real de cada um, com o preço e o link direto daquele item — é o que faz o cliente escolher. Use o nome EXATO como está em PRODUTOS DA LOJA e no MÁXIMO 3 marcadores por mensagem (mande os mais indicados para o que o cliente pediu). NUNCA peça licença para mostrar — perguntas como \"quer que eu te mostre as fotos?\", \"quer ver algum modelo específico?\" ou \"prefere que eu te mostre todos?\" são PROIBIDAS: apenas ANUNCIE e mande, no estilo \"Vou te enviar 3 modelos\", seguido dos marcadores. Não use o marcador quando estiver falando da loja em geral (aí vale o link do catálogo) nem repita o mesmo produto que você já mostrou nesta conversa. Ao responder uma DÚVIDA sobre produtos que você já mostrou (tecido, medidas, cores, tamanhos, entrega), responda apenas com TEXTO, SEM marcador nenhum — o cliente já está com as fotos na conversa. Se a loja tiver MAIS produtos do tipo que o cliente pediu além dos 3 que você mostrou, diga isso na MESMA mensagem e convide-o a ver o restante no nosso catálogo — pelo link do site ou pelo PDF —, no estilo \"e temos mais opções no nosso catálogo, pelo site ou pelo PDF\". Se ele pedir para ver mais, mande 3 OUTROS produtos do mesmo tipo/categoria que ele pediu, diferentes de todos os que você já mostrou nesta conversa, e siga assim de 3 em 3 até acabarem os produtos daquele tipo — quando acabarem, diga que esses são todos e ofereça outra categoria. NUNCA escreva você um link de produto ou de foto: só o marcador."
      : "",
    "- SALVAR O NOME DO CLIENTE: assim que souber o nome do cliente (ele se apresentar, disser o nome, ou o nome vier na mensagem do pedido do site), inclua UMA única vez, no final da mensagem, o marcador [[NOME_CLIENTE:nome do cliente]] (ex.: [[NOME_CLIENTE:Maria Silva]]) para o sistema salvar o contato. Use o nome exatamente como o cliente informou. NÃO repita esse marcador nas mensagens seguintes e NUNCA o mostre ou explique ao cliente.",
    products.length > 0
      ? [
          "- REGISTRAR O PEDIDO NO SISTEMA: quando o cliente CONFIRMAR o fechamento de um pedido montado aqui pela conversa ou pelo catálogo em PDF (NÃO o pedido pronto do site, que já é registrado sozinho) e você já tiver os itens, a forma de envio/endereço e a forma de pagamento, inclua no FINAL da mensagem um bloco de pedido para o sistema registrar no painel da loja, EXATAMENTE neste formato (abre, o JSON numa linha, fecha):",
          "[[PEDIDO]]",
          '{"itens":[{"nome":"NOME EXATO DO PRODUTO","cor":"","tamanho":"","qtd":1}],"envio":"retirada","pagamento":"pix","endereco":"","excursao":"","transportadora":""}',
          "[[/PEDIDO]]",
          "Regras do bloco: use o NOME EXATO de cada produto como aparece em PRODUTOS DA LOJA (não invente produtos fora do catálogo); preencha cor/tamanho só se o cliente escolheu (senão deixe \"\"); qtd é a quantidade (número). No campo envio use SÓ uma destas palavras: retirada, correios, excursao, transportadora. No campo pagamento use SÓ: pix, dinheiro, cartao, mercadopago. Preencha endereco quando for entrega (não na retirada); excursao/transportadora só quando o envio for esse. Emita o bloco UMA única vez, apenas no fechamento confirmado; NUNCA o mostre nem o explique ao cliente e não escreva você o número do pedido — o sistema confirma o registro.",
        ].join("\n")
      : "",
    "- Os marcadores [[...]] e o bloco [[PEDIDO]] são comandos internos: use-os só quando fizer sentido, nunca os explique ao cliente e nunca os escreva em outro contexto.",
    hasPickup
      ? "- RETIRADA: quando o cliente escolher retirar o pedido no local (o pedido chega marcado como 'Retirada'), OU perguntar como/onde retirar, explique proativamente, sem enrolar, onde e como retirar, usando as informações em RETIRADA DE PEDIDOS abaixo (endereço e instruções). Não invente horários nem regras que não estejam ali."
      : "",
    saleMode === "atacado"
      ? "- MODO DE VENDA (ATACADO): esta loja trabalha com atacado (revenda / maior quantidade). Deixe claro, de forma natural, que a loja segue pedido mínimo conforme a regra dela e conduza o cliente pela lógica de comprar em quantidade. Se ele quiser fechar abaixo do mínimo, explique a regra com firmeza e ofereça completar o pedido ou a melhor alternativa disponível. Fale a língua do revendedor (giro, margem, recompra), mas NÃO invente números: só cite margem/lucro se o próprio cliente disser por quanto pretende revender."
      : saleMode === "ambos"
      ? "- MODO DE VENDA (VAREJO E ATACADO): esta loja atende tanto varejo (uso próprio) quanto atacado (revenda / maior quantidade). Logo no começo, descubra de forma natural se a compra é para uso próprio ou em maior quantidade e conduza pela regra certa (no atacado vale o pedido mínimo)."
      : "",
    minOrderText
      ? `- PEDIDO MÍNIMO: esta loja exige um pedido mínimo de ${minOrderText}. Se o cliente perguntar se tem pedido mínimo, qual o valor/quantidade mínima, ou quiser fechar um pedido abaixo disso, informe o mínimo com clareza (${minOrderText}) e incentive-o a completar o carrinho para atingir o mínimo e conseguir finalizar. No catálogo online, o botão de finalizar só libera quando o pedido atinge esse mínimo. NÃO invente um valor diferente deste. Ao informar o mínimo, feche CONDUZINDO, nunca pedindo permissão: diga exatamente neste estilo: "Vamos montar sua lista pra gente fechar hoje seu pedido. Me diz o que precisa". Perguntas mornas como "quer montar uma lista?", "quer que eu te ajude a montar?" ou "quer ver mais alguma coisa?" são PROIBIDAS aqui.${
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
    attendanceText
      ? `- DIAS/HORÁRIO DE ATENDIMENTO: esta loja atende em ${attendanceText}. Se o cliente perguntar quando a loja funciona, em que dias/horário atende, ou se está aberta, informe exatamente isso. NÃO invente outros dias ou horários.`
      : "",
    "",
    onlineOnly
      ? `LOCALIZAÇÃO DA LOJA:\n(Loja 100% online — sem endereço físico.${
          onlineCityText ? ` Fica em ${onlineCityText}, atende online.` : ""
        })`
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
    attendanceText
      ? `DIAS/HORÁRIO DE ATENDIMENTO:\n${attendanceText}`
      : "",
    "",
    "PRODUTOS DA LOJA:",
    formatCatalog(products),
    "",
    "INFORMAÇÕES / POLÍTICAS DA LOJA (FAQ):",
    faq.trim() ? faq.trim() : "(Sem informações adicionais cadastradas.)",

    // ─────────────────────────────────────────────────────────────────────
    // ÚLTIMO BLOCO, DE PROPÓSITO — é aqui que mora TUDO que muda dentro de
    // uma mesma conversa. O cache da OpenAI casa por PREFIXO: qualquer byte
    // que muda invalida tudo o que vem DEPOIS dele. Como `isFirstContact`
    // vira `false` já na 2ª resposta e `custFirst` aparece quando a IA
    // descobre o nome, deixá-los no meio das "Regras" quebrava o cache logo
    // no começo — justamente onde havia mais a economizar, já que uma
    // conversa faz 15-20 chamadas e cada uma reenvia este prompt inteiro.
    // No fim, todo o bloco acima (regras + catálogo + FAQ) vira prefixo
    // estável e é cobrado com desconto da 2ª chamada em diante.
    //
    // ⚠️ Ao adicionar campo novo ao prompt, pergunte: "muda no meio da
    // conversa?" Se sim, o lugar é AQUI embaixo. Se é por loja (catálogo,
    // FAQ, formas de pagamento…), vai em cima — trocar de loja invalida o
    // cache de qualquer jeito, então não custa nada.
    // ─────────────────────────────────────────────────────────────────────
    "",
    "CONTEXTO DESTA CONVERSA:",
    isFirstContact
      ? `- Esta é a PRIMEIRA mensagem deste cliente. É OBRIGATÓRIO se apresentar logo na abertura: diga seu nome (${aiName}) E o nome da loja ("${storeName}") ANTES de fazer qualquer pergunta. Só depois faça UMA pergunta que avance a venda. Modelo (espelhe a saudação do cliente${
          custFirst ? ` e chame-o pelo nome, ${custFirst}` : ""
        }): "Boa noite${custFirst ? `, ${custFirst}` : ""}! 😊 Aqui é ${aiName}, da ${storeName}. Me diz: você tá procurando qual tipo de produto hoje?". Apresente-se apenas uma vez, neste primeiro contato.`
      : conversationRestart
      ? `- Este cliente já falou com a loja antes, mas está VOLTANDO agora depois de um tempo parado — para ele é uma conversa nova. Cumprimente${
          custFirst ? ` pelo nome (${custFirst})` : ""
        }, espelhando a saudação dele, e diga de novo, de forma curta e natural, seu nome (${aiName}) e o da loja ("${storeName}") — ele pode não lembrar quem está atendendo. Depois responda o que ele falou e faça UMA pergunta que avance a venda. Ex.: "Bom dia${
          custFirst ? `, ${custFirst}` : ""
        }! 😊 Aqui é ${aiName}, da ${storeName}, de novo por aqui. …". Não repita a apresentação nas mensagens seguintes desta conversa.`
      : "- Você já se apresentou antes nesta conversa. NÃO repita a apresentação; vá direto ao ponto.",
    custFirst
      ? `- Este cliente já é da casa: o primeiro nome dele é ${custFirst}. Use o nome JÁ na saudação de abertura (ex.: "Bom dia, ${custFirst}!") e depois trate-o pelo nome com naturalidade, sem exagerar (não repita o nome em toda frase). NUNCA invente nem troque o nome.`
      : "- Você NÃO sabe o nome deste cliente. Não invente um nome nem o chame por um nome qualquer; se fizer sentido, pergunte o nome dele de forma natural.",
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
  /**
   * Produtos que a IA citou e quer MOSTRAR ([[PRODUTO:nome]]). O sistema resolve
   * cada nome no catálogo e manda a foto real com preço e o link direto do item —
   * a IA nunca monta esse balão sozinha (não sabe a URL da foto nem o id).
   */
  productNames: string[];
  /**
   * Nome do cliente que a IA identificou (apresentação ou pedido vindo do site).
   * Vazio = nada a salvar. O sistema persiste no contato para saudar pelo nome
   * nas próximas conversas.
   */
  customerName: string;
  /**
   * Pedido que a IA fechou pela conversa/PDF (bloco [[PEDIDO]]…[[/PEDIDO]]), para
   * o sistema registrar no painel. null = nenhum pedido a registrar.
   */
  orderDraft: AiOrderDraft | null;
};

/** Item de um pedido que a IA montou pela conversa (nome exato do catálogo). */
export type AiOrderItem = {
  nome: string;
  cor?: string;
  tamanho?: string;
  qtd?: number;
};

/**
 * Pedido fechado pela IA na conversa (bloco [[PEDIDO]]{json}[[/PEDIDO]]). Os
 * nomes dos produtos/cores/tamanhos são resolvidos contra o catálogo pelo
 * sistema; envio/pagamento usam os ids conhecidos.
 */
export type AiOrderDraft = {
  itens: AiOrderItem[];
  /** excursao | correios | transportadora | retirada */
  envio?: string;
  /** pix | dinheiro | cartao | mercadopago */
  pagamento?: string;
  endereco?: string;
  excursao?: string;
  transportadora?: string;
};

/**
 * Interpreta o conteúdo do bloco [[PEDIDO]] como JSON (tolerante a cercas ```json
 * e a texto solto em volta). Devolve null se não for um pedido válido (pelo menos
 * um item com nome).
 */
export function parseAiOrderJson(raw: string): AiOrderDraft | null {
  let s = raw.trim();
  if (!s) return null;
  // Remove cercas de código, se a IA envolver em ```json … ```.
  s = s.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/i, "").trim();
  // Se vier texto antes/depois, isola o primeiro objeto {...}.
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first === -1 || last === -1 || last < first) return null;
  s = s.slice(first, last + 1);
  let obj: unknown;
  try {
    obj = JSON.parse(s);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const rawItens = Array.isArray(o.itens) ? o.itens : [];
  const itens: AiOrderItem[] = [];
  for (const it of rawItens) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const nome = String(r.nome ?? "").trim();
    if (!nome) continue;
    const qtdNum = Math.floor(Number(r.qtd));
    itens.push({
      nome: nome.slice(0, 200),
      cor: r.cor != null ? String(r.cor).trim().slice(0, 80) : "",
      tamanho: r.tamanho != null ? String(r.tamanho).trim().slice(0, 80) : "",
      qtd: Number.isFinite(qtdNum) && qtdNum > 0 ? qtdNum : 1,
    });
  }
  if (itens.length === 0) return null;
  const str = (v: unknown) => (v != null ? String(v).trim() : "");
  return {
    itens,
    envio: str(o.envio).toLowerCase(),
    pagamento: str(o.pagamento).toLowerCase(),
    endereco: str(o.endereco).slice(0, 500),
    excursao: str(o.excursao).slice(0, 120),
    transportadora: str(o.transportadora).slice(0, 120),
  };
}

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
  // Produtos a mostrar: [[PRODUTO:Bermuda Brim]] (um por produto citado). O
  // sistema resolve o nome no catálogo e manda foto + preço + link do item.
  const productNames: string[] = [];
  const productRe = /\[\[\s*PRODUTO\s*:\s*([^\]]+?)\s*\]\]/gi;
  let pm: RegExpExecArray | null;
  while ((pm = productRe.exec(reply)) !== null) {
    const name = (pm[1] ?? "").trim().slice(0, 120);
    if (name && !productNames.includes(name)) productNames.push(name);
  }
  // Nome do cliente: [[NOME_CLIENTE:João Silva]] — captura até o "]]".
  const nameMatch = reply.match(/\[\[\s*NOME_CLIENTE\s*:\s*([^\]]+?)\s*\]\]/i);
  const customerName = (nameMatch?.[1] ?? "").trim().slice(0, 80);
  // Pedido fechado pela conversa: [[PEDIDO]]{json}[[/PEDIDO]].
  const orderMatch = reply.match(
    /\[\[\s*PEDIDO\s*\]\]([\s\S]*?)\[\[\s*\/\s*PEDIDO\s*\]\]/i
  );
  const orderDraft = orderMatch ? parseAiOrderJson(orderMatch[1]) : null;
  const text = reply
    .replace(/\[\[\s*PEDIDO\s*\]\][\s\S]*?\[\[\s*\/\s*PEDIDO\s*\]\]/gi, "")
    .replace(/\[\[\s*ENVIAR_LOCALIZACAO\s*\]\]/gi, "")
    .replace(/\[\[\s*ENVIAR_FOTO\s*\]\]/gi, "")
    .replace(/\[\[\s*ENVIAR_VIDEO\s*\]\]/gi, "")
    .replace(/\[\[\s*ENVIAR_CATALOGO\s*\]\]/gi, "")
    .replace(/\[\[\s*ENVIAR_PIX\s*\]\]/gi, "")
    .replace(/\[\[\s*NOME_CLIENTE\s*:[^\]]*\]\]/gi, "")
    .replace(/\[\[\s*PRODUTO\s*:[^\]]*\]\]/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    text,
    sendLocation,
    sendPhoto,
    sendVideo,
    sendCatalog,
    sendPix,
    productNames,
    customerName,
    orderDraft,
  };
}

/** Gera a resposta do atendente. Retorna o texto, ou null se não houver conteúdo. */
export type ReplyResult = {
  text: string;
  /** Tokens totais gastos nesta chamada (para o motor de créditos descontar). */
  tokens: number;
  /**
   * Modelo e divisão entrada/saída — só para a telemetria de CUSTO do painel
   * admin (o desconto de saldo segue usando `tokens`). Como o atendimento e os
   * crons rodam em modelos de preços diferentes, e a saída custa 4x a entrada,
   * sem estes três campos não dá para converter tokens em reais.
   */
  model: string;
  inputTokens: number;
  outputTokens: number;
};

/** Extrai texto + medição de uma resposta da OpenAI. `null` se veio vazia. */
function toReplyResult(
  completion: OpenAI.Chat.Completions.ChatCompletion,
  model: string
): ReplyResult | null {
  const text = completion.choices[0]?.message?.content;
  if (!text) return null;
  const usage = completion.usage;
  return {
    text: text.trim(),
    tokens: usage?.total_tokens ?? 0,
    model,
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
  };
}

export async function generateReply(
  systemPrompt: string,
  history: ChatTurn[],
  userMessage: string
): Promise<ReplyResult | null> {
  const model = smartModel();
  const completion = await getClient().chat.completions.create({
    model,
    max_tokens: 400,
    messages: [
      { role: "system", content: systemPrompt },
      ...history.map((t) => ({ role: t.role, content: t.content })),
      { role: "user", content: userMessage },
    ],
  });
  return toReplyResult(completion, model);
}

/**
 * Descreve, em português, o conteúdo de uma foto que o cliente mandou (visão do
 * `basicModel()`). Recebe a imagem como data URI base64. A descrição é gravada como
 * texto no histórico para o atendente (que responde só com texto) ter o contexto.
 * Nunca lança: null se falhar.
 */
export async function describeImage(
  imageDataUrl: string,
  caption: string
): Promise<string | null> {
  try {
    const model = basicModel();
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
  const model = basicModel();
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
  return toReplyResult(completion, model);
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
  const model = basicModel();
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
  return toReplyResult(completion, model);
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
  const model = basicModel();
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
  return toReplyResult(completion, model);
}
