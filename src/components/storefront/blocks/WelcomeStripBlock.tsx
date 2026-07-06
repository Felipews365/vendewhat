/**
 * BLOCO: Faixa de boas-vindas
 * Finalidade: mensagem curta de acolhimento logo abaixo do banner.
 * Simples de propósito — sem imagem, só um respiro de texto centralizado.
 */
import type { WelcomeStripConfig } from "./types";
import { limitText, BLOCK_LIMITS } from "./types";
import { BlockContainer } from "./primitives";

const L = BLOCK_LIMITS.welcomeStrip;

export function WelcomeStripBlock({
  config,
  editing = false,
}: {
  config: WelcomeStripConfig;
  editing?: boolean;
}) {
  // 🖊️ Lojista edita:
  const title = limitText(config.title, L.title.max);
  const message = limitText(config.message, L.message.max);
  const emoji = (config.emoji ?? "").trim().slice(0, 2); // 1 emoji

  // Estado vazio na loja pública: sem título nem mensagem, não renderiza nada.
  if (!title && !message) {
    if (!editing) return null;
    return (
      <BlockContainer tone="muted">
        <p className="text-center text-sm text-stone-500">
          Faixa de boas-vindas — escreva uma saudação para seus clientes.
        </p>
      </BlockContainer>
    );
  }

  return (
    <BlockContainer tone="muted">
      <div className="mx-auto max-w-2xl text-center">
        {title && (
          <h2 className="font-serif text-xl font-bold text-stone-900 sm:text-2xl">
            {emoji && <span className="mr-2">{emoji}</span>}
            {/* clamp evita quebrar em títulos longos */}
            <span className="line-clamp-2">{title}</span>
          </h2>
        )}
        {message && (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-stone-600 sm:text-base">
            {message}
          </p>
        )}
      </div>
    </BlockContainer>
  );
}
