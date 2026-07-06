/**
 * Renderiza um bloco (ou uma lista) a partir da config salva.
 *
 * Uso na loja pública:
 *   {blocks.map((b) => (
 *     <BlockRenderer key={b.id} block={b} products={products} />
 *   ))}
 *
 * Na prévia do editor, passe `editing` para os blocos vazios aparecerem
 * (na loja pública eles se ocultam sozinhos).
 */
import type { BlockProduct, StoreBlock } from "./types";
import { PromoBannerBlock } from "./PromoBannerBlock";
import { WelcomeStripBlock } from "./WelcomeStripBlock";
import { CategoryShowcaseBlock } from "./CategoryShowcaseBlock";
import { ProductGridBlock } from "./ProductGridBlock";
import { WhatsAppCtaBlock } from "./WhatsAppCtaBlock";
import { CouponOfferBlock } from "./CouponOfferBlock";
import { ImageTextFeatureBlock } from "./ImageTextFeatureBlock";

export function BlockRenderer({
  block,
  products = [],
  editing = false,
}: {
  block: StoreBlock;
  /** Produtos do banco — usados pela grade de produtos. */
  products?: BlockProduct[];
  editing?: boolean;
}) {
  switch (block.type) {
    case "promoBanner":
      return <PromoBannerBlock config={block.config} editing={editing} />;
    case "welcomeStrip":
      return <WelcomeStripBlock config={block.config} editing={editing} />;
    case "categoryShowcase":
      return <CategoryShowcaseBlock config={block.config} editing={editing} />;
    case "productGrid":
      return (
        <ProductGridBlock
          config={block.config}
          products={products}
          editing={editing}
        />
      );
    case "whatsappCta":
      return <WhatsAppCtaBlock config={block.config} editing={editing} />;
    case "couponOffer":
      return <CouponOfferBlock config={block.config} editing={editing} />;
    case "imageTextFeature":
      return <ImageTextFeatureBlock config={block.config} editing={editing} />;
    default:
      return null;
  }
}
