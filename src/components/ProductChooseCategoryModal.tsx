"use client";

import { useEffect, useState } from "react";
import {
  CategoryFormModal,
  type CategoryFormSaveData,
} from "@/components/CategoryFormModal";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import {
  storefrontFromDb,
  storefrontToDb,
  upsertStorefrontCategory,
} from "@/lib/storefront";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Loja atual — necessária para criar a categoria de verdade na vitrine. */
  storeId: string | null;
  initialName?: string;
  onSave: (name: string) => void;
};

/**
 * Modal "Adicionar categoria" no cadastro do produto. Usa o mesmo editor da loja
 * (foto + categoria pai) e **cria a categoria de verdade** em `storefront.categories`,
 * além de defini-la no produto — assim o "+" gera uma categoria real da vitrine.
 */
export function ProductChooseCategoryModal({
  open,
  onClose,
  storeId,
  initialName = "",
  onSave,
}: Props) {
  const { showToast } = useToast();
  const [parentOptions, setParentOptions] = useState<string[]>([]);

  // Carrega as categorias existentes para o select "Categoria pai".
  useEffect(() => {
    if (!open || !storeId) {
      setParentOptions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const res = await supabase
        .from("stores")
        .select("storefront")
        .eq("id", storeId)
        .maybeSingle();
      if (cancelled || !res.data) return;
      const sf = storefrontFromDb((res.data as { storefront?: unknown }).storefront);
      setParentOptions(sf.categories.map((c) => c.label).filter(Boolean));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, storeId]);

  async function persist(data: CategoryFormSaveData) {
    // Define a categoria no produto (ação principal, imediata).
    onSave(data.name);
    if (!storeId) return;
    try {
      const supabase = createClient();
      const res = await supabase
        .from("stores")
        .select("storefront")
        .eq("id", storeId)
        .maybeSingle();
      if (res.error || !res.data) return;
      const sf = storefrontFromDb((res.data as { storefront?: unknown }).storefront);
      const next = upsertStorefrontCategory(sf, {
        label: data.name,
        imageUrl: data.imageUrl,
        parentLabel: data.parentLabel,
      });
      if (next === sf) return; // já existia igual — nada a gravar
      const { error } = await supabase
        .from("stores")
        .update({
          storefront: storefrontToDb(next),
          updated_at: new Date().toISOString(),
        })
        .eq("id", storeId);
      if (error) {
        showToast(
          "Categoria definida no produto, mas não foi salva na vitrine. Tente pela Aparência da loja.",
          "error"
        );
      }
    } catch {
      showToast(
        "Categoria definida no produto, mas não foi salva na vitrine.",
        "error"
      );
    }
  }

  return (
    <CategoryFormModal
      variant="store"
      open={open}
      onClose={onClose}
      storeId={storeId}
      title={initialName.trim() ? "Editar categoria" : "Adicionar Categoria"}
      initialName={initialName}
      initialImageUrl=""
      parentCategoryOptions={parentOptions}
      onSave={(d) => void persist(d)}
    />
  );
}
