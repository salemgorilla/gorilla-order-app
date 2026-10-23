"use client";

import Chip from "../../components/ui/Chip";
import {
  PAPER_SIDES,
  paperProductById,
  paperProducts,
  type PaperProductId,
  type PaperSpec,
} from "../../lib/paper";
import type { FieldErrors } from "../../lib/validation";

type Props = {
  spec: PaperSpec;
  fieldErrors?: FieldErrors;
  onSelectProduct: (productId: PaperProductId) => void;
  onUpdate: (updates: Partial<PaperSpec>) => void;
};

/**
 * Order Desk — paper printing, as a quote request.
 *
 * Business cards, rack cards, postcards, brochures, letterhead and menus,
 * printed through the shop's trade partner. Every choice here is one the
 * catalogue (lib/paper.ts) actually sells, so there is no free-text stock or
 * size to misread, and a spec that passes this form passes the server.
 *
 * No price is shown anywhere in this flow, and the closing note says so. Prices
 * come from the shop's own cost plus its markup (lib/paper-pricing.ts), and
 * until those numbers are real a figure on this screen would be one nobody has
 * stood behind.
 */
export default function PaperRequestBuilder({
  spec,
  fieldErrors,
  onSelectProduct,
  onUpdate,
}: Props) {
  const product = paperProductById(spec.productId) ?? paperProducts[0];

  return (
    <div className="space-y-8">
      <div className="border border-[var(--rule)] bg-[var(--shirt-blank)] p-6">
        <h3 className="text-lede font-bold">What are we printing?</h3>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {paperProducts.map((item) => (
            <Chip
              key={item.id}
              label={item.label}
              selected={spec.productId === item.id}
              onSelect={() => onSelectProduct(item.id)}
            />
          ))}
        </div>

        <p className="mt-4 text-fine text-[var(--ink-muted)]">{product.blurb}</p>
      </div>

      {product.sizes.length > 1 && (
        <div className="border border-[var(--rule)] bg-[var(--shirt-blank)] p-6">
          <h3 className="text-lede font-bold">Size</h3>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {product.sizes.map((size) => (
              <Chip
                key={size.label}
                label={size.label}
                spec
                selected={spec.size === size.label}
                onSelect={() => onUpdate({ size: size.label })}
              />
            ))}
          </div>
        </div>
      )}

      <div className="border border-[var(--rule)] bg-[var(--shirt-blank)] p-6">
        <h3 className="text-lede font-bold">Paper stock</h3>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {product.stocks.map((stock) => (
            <Chip
              key={stock}
              label={stock}
              selected={spec.stock === stock}
              onSelect={() => onUpdate({ stock })}
            />
          ))}
        </div>
      </div>

      <div className="border border-[var(--rule)] bg-[var(--shirt-blank)] p-6">
        <h3 className="text-lede font-bold">How many?</h3>

        <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {product.quantities.map((quantity) => (
            <Chip
              key={quantity}
              label={quantity.toLocaleString("en-US")}
              spec
              selected={spec.quantity === quantity}
              onSelect={() => onUpdate({ quantity })}
            />
          ))}
        </div>

        <p className="mt-4 text-fine text-[var(--ink-muted)]">
          Need a different amount? Pick the closest and say so in the notes.
        </p>
      </div>

      <div className="border border-[var(--rule)] bg-[var(--shirt-blank)] p-6">
        <h3 className="text-lede font-bold">Printing</h3>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {PAPER_SIDES.map((sides) => (
            <Chip
              key={sides}
              label={sides}
              selected={spec.sides === sides}
              onSelect={() => onUpdate({ sides })}
            />
          ))}
        </div>

        {product.finishing.length > 0 && (
          <div className="mt-6">
            <p className="text-fine font-semibold text-[var(--ink-black)]">Finishing</p>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {product.finishing.map((item) => {
                const on = spec.finishing.includes(item);

                return (
                  <Chip
                    key={item}
                    label={item}
                    selected={on}
                    onSelect={() =>
                      onUpdate({
                        finishing: on
                          ? spec.finishing.filter((entry) => entry !== item)
                          : [...spec.finishing, item],
                      })
                    }
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="border border-[var(--rule)] bg-[var(--shirt-blank)] p-6">
        <label htmlFor="paper-request-notes" className="block">
          <span className="text-lede font-semibold text-[var(--ink-black)]">
            Anything else we should know?
          </span>
        </label>

        <p className="mt-2 text-fine text-[var(--ink-muted)]">
          Optional. Special folds, a deadline, a different quantity, a reprint
          of something you already have.
        </p>

        <textarea
          id="paper-request-notes"
          value={spec.notes}
          onChange={(event) => onUpdate({ notes: event.target.value })}
          rows={4}
          maxLength={2000}
          className="mt-4 w-full border border-[var(--rule)] bg-[var(--paper)] px-4 py-3 font-bold text-[var(--ink-black)] transition-colors duration-[120ms] ease-linear hover:border-[var(--ink-black)]"
        />
      </div>

      {fieldErrors?.paperSpec && (
        <p role="alert" className="text-fine font-bold text-[var(--rush-red)]">
          {fieldErrors.paperSpec}
        </p>
      )}

      {/* Said plainly and up front: a customer who expected a number needs to
          know there isn't one yet, and that is the intent, not a failure. */}
      <p className="border border-[var(--rule)] border-l-4 border-l-[var(--ink-warn)] bg-[var(--surface-warn)] p-4 text-fine font-bold text-[var(--ink-warn)]">
        Paper printing is quoted by hand — there is no instant price on this one
        yet. Send it over and Gorilla Salem will reply with a price. Nothing is
        charged until you agree to it.
      </p>
    </div>
  );
}
