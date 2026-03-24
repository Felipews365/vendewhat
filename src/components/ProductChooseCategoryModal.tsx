"use client";

import { CategoryFormModal } from "@/components/CategoryFormModal";

type Props = {
  open: boolean;
  onClose: () => void;
  initialName?: string;
  onSave: (name: string) => void;
};

/** Modal “Adicionar categoria” no cadastro do produto (mesmo visual da loja). */
export function ProductChooseCategoryModal({
  open,
  onClose,
  initialName = "",
  onSave,
}: Props) {
  return (
    <CategoryFormModal
      variant="product"
      open={open}
      onClose={onClose}
      title={
        initialName.trim() ? "Editar categoria" : "Adicionar Categoria"
      }
      initialName={initialName}
      initialImageUrl=""
      onSave={(d) => onSave(d.name)}
    />
  );
}
