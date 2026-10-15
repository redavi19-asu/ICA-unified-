import { NextResponse } from "next/server";
import { requireSession } from "../../../../lib/auth";
import { apiRevenueDatabase } from "../../../../lib/api-revenue-database";
import {
  apiRevenueRequired,
  apiRevenueStatus,
} from "../../../../lib/api-revenue";
import {
  apiPlanConfiguration,
  createApiCheckout,
  cancelApiRenewal,
} from "../../../../lib/api-revenue-stripe";
async function owner() {
  const { membership } = await requireSession({ allowUnentitled: true });
  return ["OWNER", "ADMIN"].includes(membership.role) ? membership : null;
}
export async function GET() {
  const membership = await owner();
  if (!membership)
    return NextResponse.json(
      { error: "Owner/admin access required." },
      { status: 403 },
    );
  return NextResponse.json(
    {
      ...(await apiRevenueStatus(
        apiRevenueDatabase(),
        membership.organizationId,
        apiRevenueRequired(process.env.API_PAID_ACCESS_REQUIRED),
      )),
      pricing: apiPlanConfiguration(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  const membership = await owner();
  if (!membership)
    return NextResponse.json(
      { error: "Owner/admin access required." },
      { status: 403 },
    );
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return NextResponse.json(
      { error: "Open API billing from Unified." },
      { status: 403 },
    );
  const body = await request.json().catch(() => null);
  if (body?.action === "CANCEL_API_RENEWAL") {
    if (body.confirmation !== "CANCEL API")
      return NextResponse.json(
        { error: "Confirm cancellation of the separate API renewal." },
        { status: 400 },
      );
    try {
      return NextResponse.json(
        await cancelApiRenewal(membership.organizationId),
      );
    } catch {
      return NextResponse.json(
        { error: "API renewal could not be cancelled. Contact support." },
        { status: 409 },
      );
    }
  }
  if (body?.action !== "CHECKOUT")
    return NextResponse.json(
      { error: "Choose an API billing action." },
      { status: 400 },
    );
  if (!apiPlanConfiguration().ready)
    return NextResponse.json(
      {
        error:
          "The separate API plan price and allowance are not configured yet.",
        code: "API_BILLING_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  try {
    return NextResponse.json({
      checkoutUrl: await createApiCheckout({
        organizationId: membership.organizationId,
        organizationName: membership.organization.name,
        email: membership.user.email,
        origin: new URL(request.url).origin,
      }),
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "API checkout could not start. Review existing billing or contact support.",
      },
      { status: 409 },
    );
  }
}
