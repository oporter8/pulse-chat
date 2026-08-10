import Link from "next/link";
import { TIGER_LEGAL_EFFECTIVE_DATE, TIGER_MINIMUM_AGE, TIGER_PRIVACY_VERSION, TIGER_TOS_VERSION } from "@/lib/legal";

type Kind = "terms" | "privacy" | "guidelines";

export function LegalDocument({ kind }: { kind: Kind }) {
  if (kind === "privacy") return <Privacy />;
  if (kind === "guidelines") return <Guidelines />;
  return <Terms />;
}

function LegalHeader({ eyebrow, title, version }: { eyebrow: string; title: string; version?: string }) {
  return <header className="v13-legal-header">
    <p className="v12-kicker">{eyebrow}</p>
    <h1>{title}</h1>
    <p>Effective {TIGER_LEGAL_EFFECTIVE_DATE}{version ? ` · Version ${version}` : ""}</p>
    <nav><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/guidelines">Community Guidelines</Link><Link href="/">Tiger Chat</Link></nav>
  </header>;
}

function Terms() {
  return <article className="v13-legal-document">
    <LegalHeader eyebrow="Tiger Chat legal" title="Terms of Service" version={TIGER_TOS_VERSION} />
    <section><h2>1. Agreement and eligibility</h2><p>By creating or using a Tiger Chat account, you agree to these Terms, the Privacy Policy, and the Community Guidelines. You must be at least {TIGER_MINIMUM_AGE} years old. If you are under the age of majority where you live, you represent that you have any parent or guardian permission required for you to use the service.</p></section>
    <section><h2>2. Independent community service</h2><p>Tiger Chat is an independently operated messaging and community service. Unless the service explicitly states otherwise, it is not an official service of Fishers High School, Hamilton Southeastern Schools, or any other school, district, employer, or organization whose name may be discussed by users.</p></section>
    <section><h2>3. Accounts and security</h2><p>You are responsible for the accuracy of the information you provide, keeping your credentials secure, and activity performed through your account. Do not share passwords or intentionally bypass account, moderation, safety, or access controls.</p></section>
    <section><h2>4. Acceptable use</h2><p>You may not use Tiger Chat to harass, threaten, exploit, impersonate, spam, defraud, distribute malware, reveal another person’s private information without permission, coordinate illegal conduct, or post content that violates another person’s rights. Sexual exploitation content involving minors is prohibited. User-generated images and video are disabled by product design; do not attempt to bypass that restriction through files, links, encoding, or custom themes.</p></section>
    <section><h2>5. Your content</h2><p>You keep ownership of content you create. You grant Tiger Chat the limited permission needed to store, transmit, display, moderate, back up, and otherwise process that content solely to operate, secure, and improve the service. You are responsible for having the right to share what you send.</p></section>
    <section><h2>6. Moderation and enforcement</h2><p>Administrators may remove content, restrict features, suspend accounts, or ban accounts when reasonably necessary to enforce these Terms, protect users, respond to abuse reports, comply with law, or protect the service. Moderation decisions may consider context and repeated behavior.</p></section>
    <section><h2>7. Voice messages, documents, and links</h2><p>Tiger Chat may allow voice notes, documents, and links. Do not upload files you do not have permission to share, malicious files, or content that violates these Terms. External links lead to services Tiger Chat does not control.</p></section>
    <section><h2>8. Support contributions and supporter status</h2><p>Any Support Center contribution is voluntary and helps operate the service. Supporter badges or cosmetic/community perks are acknowledgements and may change over time. A contribution does not purchase ownership, guaranteed uptime, moderation immunity, or control over the service.</p></section>
    <section><h2>9. Availability and changes</h2><p>The service may change, experience outages, or discontinue features. Reasonable efforts may be made to preserve data and functionality, but uninterrupted operation is not guaranteed. Features may be changed for safety, security, cost, technical, or legal reasons.</p></section>
    <section><h2>10. Disclaimers and responsibility</h2><p>Tiger Chat is provided on an “as available” basis to the extent permitted by law. Users are responsible for their own communications, decisions, files, links, and interactions with other users. Nothing in these Terms removes rights that cannot legally be waived.</p></section>
    <section><h2>11. Account termination</h2><p>You may stop using the service and may use available account-deletion tools. Administrators may suspend or terminate accounts for material or repeated violations, security concerns, abuse, or legal requirements.</p></section>
    <section><h2>12. Changes to these Terms</h2><p>When material terms change, Tiger Chat may require you to accept a new version before continuing. The acceptance record stores the version and acceptance time associated with your account.</p></section>
    <section><h2>13. Questions</h2><p>Questions about these Terms can be directed to the Tiger Chat administrator through the service’s available support or moderation channels.</p></section>
  </article>;
}

function Privacy() {
  return <article className="v13-legal-document">
    <LegalHeader eyebrow="Tiger Chat legal" title="Privacy Policy" version={TIGER_PRIVACY_VERSION} />
    <section><h2>1. What Tiger Chat stores</h2><p>Tiger Chat may store account identifiers, email-based authentication information handled by the authentication provider, profile text, messages, reactions, group membership, reports, moderation actions, voice notes and permitted documents, device/session records, notification preferences, theme settings, supporter bookkeeping, and legal-acceptance records.</p></section>
    <section><h2>2. Why the data is used</h2><p>Data is used to provide messaging and community features, authenticate accounts, deliver notifications, enforce safety and moderation rules, prevent abuse, restore sessions, personalize appearance, provide requested exports, and maintain the service.</p></section>
    <section><h2>3. Who can see content</h2><p>Message content is available to participants in the relevant conversation and may be available to authorized administrators when necessary for moderation or security. Profile and community information is shown according to the visibility controls provided by Tiger Chat.</p></section>
    <section><h2>4. Service providers</h2><p>Tiger Chat relies on infrastructure and authentication/database providers to operate. Those providers may process technical information necessary to host, authenticate, store, secure, and deliver the service. External services opened through links, including payment or support apps, have their own privacy practices.</p></section>
    <section><h2>5. No sale of personal information</h2><p>Tiger Chat does not operate by selling users’ private messages or personal information to advertisers.</p></section>
    <section><h2>6. Security and device data</h2><p>Device-session identifiers, login events, push-notification subscriptions, and similar security records may be stored to support login alerts, session revocation, abuse prevention, and account protection.</p></section>
    <section><h2>7. Retention and deletion</h2><p>Information may remain while an account is active and for a reasonable period needed for backups, security, moderation, legal obligations, or service integrity. Available deletion tools can be used to request or perform account deletion, subject to records that must reasonably be retained.</p></section>
    <section><h2>8. Young users</h2><p>Tiger Chat is intended for users age {TIGER_MINIMUM_AGE} and older. The service is not intended for children under {TIGER_MINIMUM_AGE}. Users below the age of majority should involve a parent or guardian when required by applicable rules.</p></section>
    <section><h2>9. Legal acceptance records</h2><p>Tiger Chat stores the Terms and Privacy versions you accepted and the time of acceptance. This allows the service to determine when a newer version needs to be shown to you.</p></section>
    <section><h2>10. Changes</h2><p>This policy may be updated as features, providers, or legal requirements change. Material updates may require renewed acceptance.</p></section>
  </article>;
}

function Guidelines() {
  return <article className="v13-legal-document">
    <LegalHeader eyebrow="Tiger Chat safety" title="Community Guidelines" />
    <section><h2>Respect people</h2><p>Do not target people with harassment, bullying, threats, slurs, humiliation, unwanted sexual behavior, or coordinated abuse.</p></section>
    <section><h2>Protect privacy</h2><p>Do not share addresses, phone numbers, passwords, private messages, school records, or other sensitive information about another person without permission.</p></section>
    <section><h2>Keep accounts authentic</h2><p>Do not impersonate another student, teacher, staff member, organization, administrator, or public figure in a deceptive way.</p></section>
    <section><h2>No dangerous or illegal use</h2><p>Do not use Tiger Chat to distribute malware, facilitate crimes, exploit minors, coordinate violence, or evade safety controls.</p></section>
    <section><h2>Respect the text/audio-only rule</h2><p>User-generated image and video uploads are disabled. Do not disguise visual media as another file type or use themes/custom CSS to load remote images.</p></section>
    <section><h2>Use reports responsibly</h2><p>Report genuine safety or rule concerns. Do not weaponize reports to harass users or overwhelm moderators.</p></section>
    <section><h2>Moderation</h2><p>Responses can range from content removal or a warning to temporary suspension or a ban depending on severity, context, and repeated behavior.</p></section>
  </article>;
}
