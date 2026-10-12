import { expandedApi } from "../../../../lib/expanded-api";
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return expandedApi(request, (await context.params).path);
}
export const GET = handle;
export const POST = handle;
