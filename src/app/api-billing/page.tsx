import { requireSession } from "../../lib/auth";
import { redirect } from "next/navigation";
import ApiBillingClient from "./ApiBillingClient";
export const metadata = { title: "API billing | ICA Unified" };
export default async function ApiBilling() {
  const { membership } = await requireSession({ allowUnentitled: true });
  if (!["OWNER", "ADMIN"].includes(membership.role)) redirect("/workspace");
  return <ApiBillingClient company={membership.organization.name} />;
}
