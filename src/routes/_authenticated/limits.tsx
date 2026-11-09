import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { LimitsSettings } from "@/components/settings/LimitsSettings";

export const Route = createFileRoute("/_authenticated/limits")({
  head: () => ({ meta: [{ title: "Goals & limits — Viral4All Ads" }] }),
  component: LimitsPage,
});

function LimitsPage() {
  return (
    <AppShell title="Goals & limits">
      <LimitsSettings />
    </AppShell>
  );
}
