import { NextResponse } from "next/server";

import {
  AGENT_IMAGE_TYPES,
  MAX_AGENT_IMAGE_BYTES,
  estimateStitchesFromLogo,
  type AgentImageType,
} from "../../../lib/embroidery-agent";
import { embroideryPlacementById } from "../../../lib/embroidery";
import { rateLimited, requestKey } from "../../../lib/rate-limit";

/**
 * "How many stitches is my logo?" — the endpoint the embroidery option calls.
 *
 * Public, and every call to the model costs money, so it is bounded three ways:
 * a per-caller rate limit, a hard size and type check on the upload, and an
 * instance-wide hourly ceiling. The rate limit is in-process (see
 * lib/rate-limit), so the ceiling is the real backstop against a spend run.
 *
 * It answers 200 with a number whenever the DESIGN is estimable, including when
 * the model is down or no key is configured (the calculator answers, and
 * `source` says so). The only refusals are for a bad request.
 *
 * Nothing about the customer is sent to the model: the image, the placement and
 * the size. The key is read here and never logged.
 */
export const dynamic = "force-dynamic";

const MAX_PER_MINUTE = 6;
const MAX_PER_HOUR_PER_INSTANCE = 120;

let hourStartedAt = 0;
let callsThisHour = 0;

function overHourlyCeiling(now = Date.now()): boolean {
  if (now - hourStartedAt > 60 * 60 * 1000) {
    hourStartedAt = now;
    callsThisHour = 0;
  }

  callsThisHour += 1;
  return callsThisHour > MAX_PER_HOUR_PER_INSTANCE;
}

export async function POST(request: Request) {
  if (rateLimited("embroidery-estimate", requestKey(request), MAX_PER_MINUTE)) {
    return NextResponse.json({ ok: false, message: "Too many requests. Try again in a minute." }, { status: 429 });
  }

  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, message: "Send the logo as a form upload." }, { status: 400 });
  }

  const file = form.get("logo");
  const placementId = String(form.get("placement") ?? "");
  const widthInches = Number(form.get("widthInches"));
  const heightInches = Number(form.get("heightInches"));

  if (!embroideryPlacementById(placementId)) {
    return NextResponse.json({ ok: false, message: "Choose where the logo goes." }, { status: 400 });
  }

  if (!(widthInches > 0) || !(heightInches > 0)) {
    return NextResponse.json({ ok: false, message: "Enter the logo's width and height." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: "Upload your logo." }, { status: 400 });
  }

  if (!(AGENT_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return NextResponse.json(
      { ok: false, message: "Upload the logo as a PNG, JPG, WebP or GIF image." },
      { status: 400 }
    );
  }

  if (file.size > MAX_AGENT_IMAGE_BYTES) {
    return NextResponse.json({ ok: false, message: "That image is too large to read. Try one under 3 MB." }, { status: 413 });
  }

  const design = { placementId: placementId as never, widthInches, heightInches };

  // Past the ceiling the model is not called; the calculator still answers.
  const useModel = !overHourlyCeiling();

  const result = await estimateStitchesFromLogo({
    apiKey: useModel ? process.env.ANTHROPIC_API_KEY : undefined,
    image: {
      base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
      mediaType: file.type as AgentImageType,
    },
    design,
    model: process.env.EMBROIDERY_AGENT_MODEL?.trim() || undefined,
  });

  if (!result) {
    return NextResponse.json(
      { ok: false, message: "That logo size does not fit the placement. We will quote it by hand." },
      { status: 422 }
    );
  }

  return NextResponse.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
}
