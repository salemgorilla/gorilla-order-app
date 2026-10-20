import { importList, readList } from "../../../lib/subscriber-admin";
import { subscriberStore } from "../../../lib/subscriber-store";

/**
 * The route is two lines on purpose.
 *
 * Everything it does lives in lib/subscriber-admin.ts, taking the store as
 * an argument, so the counts, the ordering, the CSV headers and the import
 * tallies can all be driven against a Map. Next forbids extra exports from a
 * route file, so a handler written here is a handler no test can reach —
 * and the arithmetic somebody reads off a phone to decide whether the store
 * is working would be the untested half.
 */

export async function GET(request: Request) {
  return readList(request, subscriberStore());
}

export async function POST(request: Request) {
  return importList(request, subscriberStore());
}
