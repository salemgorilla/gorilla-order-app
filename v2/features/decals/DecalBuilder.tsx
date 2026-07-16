"use client";

import QuantitySelector from "../../components/QuantitySelector";
import OptionSelector from "../../components/OptionSelector";
import { stickerCatalog } from "../../lib/catalog";
import type { Product } from "../../types/order";

type Props = {
  product: Product;
  onUpdate: (updates: Partial<Product>) => void;
  onSelectMaterial: (material: string) => void;
};

export default function DecalBuilder({
  product,
  onUpdate,
  onSelectMaterial,
}: Props) {
  return (
    <>
      <QuantitySelector
        quantities={stickerCatalog.quantities}
        selected={product.quantity}
        onSelect={(quantity) => onUpdate({ quantity })}
      />

      <OptionSelector
        title="Size"
        options={stickerCatalog.sizes}
        selected={product.size}
        onSelect={(size) => onUpdate({ size })}
      />

      <OptionSelector
        title="Shape"
        options={stickerCatalog.shapes}
        selected={product.shape}
        onSelect={(shape) => onUpdate({ shape })}
      />

      <OptionSelector
        title="Decal Type"
        options={stickerCatalog.materials}
        selected={product.material}
        onSelect={(material) => onSelectMaterial(material)}
      />
    </>
  );
}
