import { createFileRoute } from "@tanstack/react-router";
import { CONTACT_EMAIL, LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Viral4All Ads" },
      {
        name: "description",
        content:
          "What Viral4All Ads collects when you connect Meta Ads and AI apps, who receives it, how long it is kept, and how to delete it.",
      },
    ],
  }),
  component: Privacy,
});

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="22 October 2026">
      <section>
        <p>
          Viral4All Ads lets you manage your own Meta (Facebook and Instagram) ad accounts from a
          web dashboard, an AI app over MCP, or a REST API. This policy explains what we store, why,
          who else receives it and how to delete it.
        </p>
      </section>

      <section>
        <h2>What we collect</h2>
        <ul>
          <li>Your account: email address and sign-in identifier from Firebase Authentication.</li>
          <li>
            When you connect Meta: an access token, your Meta user ID, name and profile picture, the
            permissions you granted, and the ad accounts and Pages you can access.
          </li>
          <li>
            Ad data from the ad accounts you activate: campaigns, ad sets, ads, creatives, budgets
            and performance insights, kept so the dashboard, sync and alerts work.
          </li>
          <li>Creative files (images and videos) that you or your AI app upload.</li>
          <li>
            API keys and AI-app sign-ins. Keys and sign-in tokens are stored only as hashes, with a
            short key prefix so you can tell keys apart. For each AI app that registers with us, we
            keep its name and redirect URL.
          </li>
          <li>
            An activity log of actions, including each AI tool call with its inputs (when they are
            under about 2 KB) and whether it worked.
          </li>
          <li>
            Approval requests from AI apps: the change asked for, the state before it (so you can
            undo it), your decision and any note you add.
          </li>
          <li>The goals and limits you set, and the alerts our daily check finds.</li>
          <li>Campaign plans and post drafts saved in your workspace, for example by an AI app.</li>
          <li>Webhook URLs you add and their signing secrets.</li>
          <li>Which upcoming ad platforms you asked us to tell you about.</li>
          <li>A log of the emails we send you: the type and time, not the content.</li>
          <li>Server logs: your IP address and the page or API path requested.</li>
        </ul>
      </section>

      <section>
        <h2>How we use it</h2>
        <p>
          Only to provide the service you asked for: showing and changing your own ads when you,
          your API key or your AI app request it, and emailing you about approvals, alerts and your
          account. We do not sell your data, use it for advertising, or use it to train AI models.
        </p>
      </section>

      <section>
        <h2>Who else receives it</h2>
        <ul>
          <li>Meta, to carry out your requests.</li>
          <li>Google Firebase, for sign-in.</li>
          <li>Resend, to deliver our emails from alerts@viral4all.com.</li>
          <li>Cloudflare, for DNS and network protection. It caches public pages only.</li>
          <li>Our hosting provider: the database runs on a virtual server we rent.</li>
          <li>
            AI apps you connect receive what their tool calls return, under their own privacy
            policies.
          </li>
          <li>Webhook endpoints you add receive the events you subscribe to.</li>
          <li>
            Your browser loads our font from Google Fonts, and the home page loads a 3D scene from
            Spline (and sample videos from Mixkit if you try the video demo). These services see
            your IP address.
          </li>
        </ul>
      </section>

      <section>
        <h2>Where it is stored</h2>
        <p>
          In a PostgreSQL database on a virtual server we rent, separated per user. Uploaded files
          are kept on the same server. Meta access tokens never reach your browser.
        </p>
      </section>

      <section>
        <h2>How we protect it</h2>
        <ul>
          <li>All traffic to and from our site uses HTTPS.</li>
          <li>Meta access tokens are encrypted at rest (AES-256-GCM).</li>
          <li>API keys and AI-app sign-in tokens are stored only as SHA-256 hashes.</li>
          <li>
            Every query is limited to your own user, so one account can't read another's data.
          </li>
        </ul>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <ul>
          <li>Your data is kept while your account exists.</li>
          <li>
            Disconnecting Meta in the app deletes, at once: its access token, your Meta name and
            picture, its ad accounts and Pages, the ad data and change history copied from them, and
            the approval requests and alerts about them. Your goals and limits stay, so they still
            protect you if you reconnect; clear them on the Goals & limits page.
          </li>
          <li>
            Removing the app in your Facebook settings makes Meta send us a deletion request. We
            then automatically delete everything listed above for that Meta login, and your goals
            and limits too.
          </li>
          <li>
            Your activity log, uploaded files and workspace notes stay until your account is
            deleted.
          </li>
          <li>
            If you email us to delete your account, we delete it and all its data within 30 days.
          </li>
          <li>
            Database backups taken before upgrades are deleted after 30 days. Server logs (IP
            address and request path) are kept for up to 30 days.
          </li>
        </ul>
      </section>

      <section>
        <h2>Your controls</h2>
        <ul>
          <li>
            Disconnect AI apps and revoke API keys on the API keys page. They stop working at once.
          </li>
          <li>Delete webhooks on the Webhooks page.</li>
          <li>Change your goals and limits on the Goals & limits page.</li>
          <li>Disconnect Meta on the Meta connection page.</li>
          <li>Email {mail} to ask for a copy of your data or to delete your account.</li>
        </ul>
      </section>

      <section>
        <h2>Children</h2>
        <p>Viral4All Ads is not for anyone under 18.</p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>Questions about this policy: {mail}.</p>
      </section>
    </LegalPage>
  );
}
