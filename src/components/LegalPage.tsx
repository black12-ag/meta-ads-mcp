import type { ReactNode } from "react";
import { LandingNav } from "@/components/LandingNav";
import { useSession } from "@/hooks/use-session";
import { SiteFooter } from "@/components/SiteFooter";

export { CONTACT_EMAIL } from "@/components/SiteFooter";

/** Shared shell for the public legal and help pages (privacy, terms, support). */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  const { user } = useSession();
  return (
    <div className="min-h-screen bg-hero-bg font-sora text-foreground antialiased">
      <LandingNav signedIn={Boolean(user)} />
      <main className="mx-auto max-w-3xl px-6 pt-32 pb-20 lg:px-0">
        <h1 className="text-[clamp(2.25rem,5vw,3.75rem)] leading-[1.02] font-extrabold tracking-[-0.035em] text-balance">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>
        <div className="mt-10 space-y-8 text-sm leading-relaxed text-muted-foreground [&_h2]:mb-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_a]:text-primary">
          {children}
        </div>
      </main>
      <SiteFooter signedIn={Boolean(user)} />
    </div>
  );
}
