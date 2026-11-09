import { createFileRoute, Link } from "@tanstack/react-router";
import { CONTACT_EMAIL, LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — Viral4All Ads" },
      {
        name: "description",
        content:
          "How to reach Viral4All Ads support, cut off access at once, delete your data and report a security problem.",
      },
    ],
  }),
  component: Support,
});

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

function Support() {
  return (
    <LegalPage title="Support" updated="22 October 2026">
      <section>
        <h2>Contact us</h2>
        <p>
          Email {mail}. The inbox is monitored. Setting up an AI app? Start with the steps on{" "}
          <Link to="/connect">Connect AI</Link>.
        </p>
      </section>

      <section>
        <h2>What to include</h2>
        <ul>
          <li>The email address you sign in with.</li>
          <li>
            For a change made through an AI app: the approval link, or roughly when you asked for
            the change.
          </li>
          <li>What you expected, what happened, and any error message word for word.</li>
        </ul>
        <p className="mt-3">
          Never include passwords or API keys. If you shared a key by mistake, revoke it on the API
          keys page.
        </p>
      </section>

      <section>
        <h2>Cut off access right away</h2>
        <ul>
          <li>
            An AI app: on the <Link to="/api-keys">API keys</Link> page, click Disconnect next to it
            under Connected AI apps.
          </li>
          <li>An API key: on the same page, click Revoke next to the key.</li>
          <li>
            A webhook: delete it on the <Link to="/webhooks">Webhooks</Link> page.
          </li>
          <li>
            Meta: disconnect on the <Link to="/connections">Meta connection</Link> page, or remove
            the app in your Facebook settings.
          </li>
        </ul>
        <p className="mt-3">
          Each of these stops working at once. More fixes are in{" "}
          <Link to="/connect" hash="troubleshooting">
            Troubleshooting
          </Link>
          .
        </p>
      </section>

      <section>
        <h2>Delete your data</h2>
        <p>
          Email {mail} and ask us to delete your account. Send it from the address you sign in with
          so we know it's you. We delete the account and all its data within 30 days. You can ask
          for a copy of your data first. The <Link to="/privacy">Privacy Policy</Link> explains what
          we keep and for how long.
        </p>
      </section>

      <section id="security" className="scroll-mt-28">
        <h2>Report a security problem</h2>
        <p>
          Email {mail} with “Security” in the subject. Tell us what you found, how to reproduce it,
          and which page, URL or tool is affected.
        </p>
        <ul className="mt-3">
          <li>Test only with your own account and data. Don't access or change anyone else's.</li>
          <li>Don't run tests that slow down or break the service for other people.</li>
          <li>Give us a chance to fix the problem before you tell anyone else.</li>
        </ul>
        <p className="mt-3">
          The same contact is in <a href="/.well-known/security.txt">/.well-known/security.txt</a>.
        </p>
      </section>
    </LegalPage>
  );
}
