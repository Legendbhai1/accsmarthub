import { DashLayout } from "@/components/dash/DashLayout";
import { buyerNav } from "@/components/dash/navs";

export default function BuyerProfile() {
  return (
    <DashLayout title="Profile" nav={buyerNav}>
      <p className="text-sm text-muted-foreground">
        Manage your account and contact details.
      </p>
    </DashLayout>
  );
}
