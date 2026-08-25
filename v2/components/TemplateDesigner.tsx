"use client";

import TemplatePreview from "./TemplatePreview";
import {
  getTemplate,
  getTemplatesForProduct,
  type DesignTemplate,
} from "../lib/templates";

type Props = {
  productId: string;
  templateId: string | null;
  values: Record<string, string>;
  /** Per-field messages, only after a submit has been attempted. */
  errors?: Record<string, string>;
  onSelectTemplate: (templateId: string | null) => void;
  onChangeText: (fieldId: string, value: string) => void;
};

/**
 * Order Desk — start from a template.
 *
 * The customer picks artwork the shop already owns and types their own words
 * into it. This is the scoped-down answer to "let people design their own
 * sign": it covers the majority of real sign work — an event, a name and a
 * date — without the app ever having to produce a print file.
 *
 * Choosing a template is an ALTERNATIVE to uploading artwork, not an addition
 * to it, so picking one satisfies the artwork requirement on submit.
 */
export default function TemplateDesigner({
  productId,
  templateId,
  values,
  errors,
  onSelectTemplate,
  onChangeText,
}: Props) {
  const templates = getTemplatesForProduct(productId);
  const selected = getTemplate(templateId);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Start from a template</p>
        <h3 className="mt-2 text-lede font-bold">
          Use one of ours, or upload your own artwork
        </h3>
        <p className="mt-1 text-fine text-[var(--ink-muted)]">
          Pick a layout and type your wording. We set it into the finished
          artwork and send you a proof.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {templates.map((template) => (
          <TemplateChoice
            key={template.id}
            template={template}
            selected={template.id === templateId}
            onSelect={() => onSelectTemplate(template.id)}
          />
        ))}

        {/* Explicit escape hatch. Without it, a customer who chose a template
            and changed their mind has no way back to uploading their own file. */}
        <button
          type="button"
          onClick={() => onSelectTemplate(null)}
          aria-pressed={templateId === null}
          className={[
            "min-h-[44px] cursor-pointer border p-4 text-left",
            "transition-colors duration-[120ms] ease-linear",
            "active:translate-x-[2px] active:translate-y-[2px]",
            templateId === null
              ? "border-2 border-[var(--gorilla-green)] bg-[var(--surface-ok)]"
              : "border-[var(--rule)] bg-[var(--paper)] hover:border-[var(--ink-black)]",
          ].join(" ")}
        >
          <p className="font-bold text-[var(--ink-black)]">
            I&rsquo;ll upload my own artwork
          </p>
          <p className="mt-1 text-fine text-[var(--ink-muted)]">
            Already have a design? Skip the templates and send us the file.
          </p>
        </button>
      </div>

      {selected && (
        <div className="border border-[var(--rule)] bg-[var(--shirt-blank)] p-5">
          <TemplatePreview template={selected} values={values} showCaption />

          <div className="mt-5 space-y-4">
            {selected.fields.map((field) => {
              const value = values[field.id] ?? field.defaultValue;
              const error = errors?.[field.id];
              const remaining = field.maxLength - value.length;

              return (
                <div
                  key={field.id}
                  data-invalid={error ? "true" : undefined}
                >
                  <label
                    htmlFor={`template-${field.id}`}
                    className="block text-fine font-bold text-[var(--ink-black)]"
                  >
                    {field.label}{" "}
                    {field.required ? (
                      <span className="font-normal text-[var(--rush-red)]">
                        (required)
                      </span>
                    ) : (
                      <span className="font-normal text-[var(--ink-muted)]">
                        (optional)
                      </span>
                    )}
                  </label>

                  <input
                    id={`template-${field.id}`}
                    type="text"
                    value={value}
                    maxLength={field.maxLength}
                    placeholder={field.placeholder}
                    onChange={(event) =>
                      onChangeText(field.id, event.target.value)
                    }
                    aria-invalid={error ? true : undefined}
                    aria-describedby={
                      error ? `template-${field.id}-error` : undefined
                    }
                    className={`mt-1 w-full bg-[var(--paper)] p-3 text-[var(--ink-black)] transition-colors duration-[120ms] ease-linear ${
                      error
                        ? "border-2 border-[var(--rush-red)]"
                        : "border border-[var(--rule)] hover:border-[var(--ink-black)]"
                    }`}
                  />

                  {/* The cap exists so the words still fit the board and stay
                      readable from the pavement — so say that, rather than
                      letting the field just stop accepting letters. */}
                  <p className="mt-1 flex justify-between gap-3 text-fine text-[var(--ink-muted)]">
                    <span>
                      {error ? "" : "Kept short so it reads from a distance."}
                    </span>
                    <span className="spec shrink-0">
                      {remaining} left
                    </span>
                  </p>

                  {error && (
                    <p
                      id={`template-${field.id}-error`}
                      className="mt-1 text-fine font-bold text-[var(--rush-red)]"
                    >
                      {error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateChoice({
  template,
  selected,
  onSelect,
}: {
  template: DesignTemplate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "min-h-[44px] cursor-pointer border p-4 text-left",
        "transition-colors duration-[120ms] ease-linear",
        "active:translate-x-[2px] active:translate-y-[2px]",
        selected
          ? "border-2 border-[var(--gorilla-green)] bg-[var(--surface-ok)]"
          : "border-[var(--rule)] bg-[var(--paper)] hover:border-[var(--ink-black)]",
      ].join(" ")}
    >
      {/* The thumbnail is the template at its own defaults — what you get
          before typing anything, which is the honest thing to advertise. */}
      <TemplatePreview template={template} values={{}} className="mb-3" />

      <p className="font-bold text-[var(--ink-black)]">{template.name}</p>
      <p className="mt-1 text-fine text-[var(--ink-muted)]">
        {template.description}
      </p>
    </button>
  );
}
