import { createFileRoute } from "@tanstack/react-router";
import { CONTACT_EMAIL, LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Viral4All Ads" },
      { name: "description", content: "The terms for using Viral4All Ads." },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="23 October 2026">
      <section>
        <h2>The service</h2>
        <p>
          Viral4All Ads is a tool for managing Meta ad accounts you own or are authorized to manage,
          through a dashboard, an MCP endpoint for AI assistants, and a REST API.
        </p>
      </section>

      <section>
        <h2>Your responsibilities</h2>
        <ul>
          <li>Only connect Meta accounts, ad accounts and Pages you are allowed to manage.</li>
          <li>
            Follow Meta's Terms, Advertising Standards and Platform Terms for every ad you create or
            change.
          </li>
          <li>Keep your login and API keys secret; actions taken with them count as yours.</li>
        </ul>
      </section>

      <section>
        <h2>Ad spend</h2>
        <p>
          Budgets and charges are between you and Meta. Changes you, your API keys or your AI
          assistant make through the service are sent to Meta as your instructions. Review them
          before approving; we are not responsible for spend resulting from those instructions.
        </p>
      </section>

      <section>
        <h2>Availability</h2>
        <p>
          The service is provided as is. We may change, suspend or end features, and Meta may limit
          access to its APIs at any time.
        </p>
      </section>

      <section>
        <h2>Ending use</h2>
        <p>
          You can stop at any time and ask us to delete your data, as described in the{" "}
          <a href="/privacy">Privacy Policy</a>. We may suspend accounts that misuse the service or
          Meta's platform.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>Operated by whoever runs this server. Add your details here.</p>
        <p>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </section>
    </LegalPage>
  );
}
