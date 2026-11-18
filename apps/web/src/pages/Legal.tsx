import { Link } from 'react-router-dom';
import { Logo } from '@/components/layout';
import { useDocumentTitle } from '@/lib/hooks';

function LegalShell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  useDocumentTitle(title);
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
          <Link to="/"><Logo /></Link>
          <Link to="/" className="text-[14px] text-muted hover:text-fg">← Back to home</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="font-display text-3xl font-semibold text-fg">{title}</h1>
        <p className="mt-2 text-[13px] text-muted">Last updated {updated}</p>
        <div className="mt-8 space-y-6 text-[15px] leading-7 text-fg-2 [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-fg [&_li]:ml-5 [&_li]:list-disc">
          {children}
        </div>
      </main>
    </div>
  );
}

export function Privacy() {
  return (
    <LegalShell title="Privacy Policy" updated="19 November 2026">
      <p>
        Partner in Project is a student project (UCS503 Software Engineering Lab, Thapar Institute of Engineering &amp; Technology)
        that helps students find teammates for projects, hackathons and research. This page explains what we collect and why.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Account details: your name, email address and a hashed password (or your Google account's name and email if you sign in with Google).</li>
        <li>Profile details you choose to add: institution, department, year, bio, skills, interests, roles, availability, projects, achievements and a profile photo.</li>
        <li>GitHub data, if you link GitHub: your public username, public profile and public repositories (names, languages, topics, stars). We request read-only access and never access private repositories.</li>
        <li>Activity inside the app: team posts, applications, invitations, messages, connections and notifications.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To run your account and show your profile to other signed-in students.</li>
        <li>To calculate match scores and skill-gap analysis between you and teams.</li>
        <li>To send account emails (verification codes, password resets and notifications you can turn off in Settings).</li>
      </ul>
      <h2>What we don't do</h2>
      <ul>
        <li>We do not sell or share your data with advertisers.</li>
        <li>We do not post to GitHub or Google on your behalf.</li>
      </ul>
      <h2>Storage and security</h2>
      <p>
        Data is stored in MongoDB Atlas. Passwords are hashed with bcrypt, GitHub tokens are encrypted, and sessions use secure
        httpOnly cookies. Email is delivered through Brevo.
      </p>
      <h2>Your choices</h2>
      <p>
        You can edit or remove profile information, disconnect GitHub, or delete your account at any time from Settings. Deleting
        your account removes your profile and personal data.
      </p>
      <h2>Contact</h2>
      <p>Questions? Email <a className="text-primary underline" href="mailto:bhargavchetanya47@gmail.com">bhargavchetanya47@gmail.com</a>.</p>
    </LegalShell>
  );
}

export function Terms() {
  return (
    <LegalShell title="Terms of Use" updated="19 November 2026">
      <p>Partner in Project is a free student project provided as-is, without warranties of any kind.</p>
      <h2>Using the platform</h2>
      <ul>
        <li>Use your real identity and keep your profile accurate.</li>
        <li>Be respectful. Harassment, spam, impersonation and illegal content are not allowed and can be reported.</li>
        <li>Administrators may remove content or suspend accounts that break these rules.</li>
      </ul>
      <h2>Your content</h2>
      <p>You own what you post. By posting it you allow it to be shown to other signed-in users of the platform.</p>
      <h2>Changes</h2>
      <p>These terms may be updated; continued use means you accept the latest version.</p>
      <p>See also our <Link className="text-primary underline" to="/privacy">Privacy Policy</Link>.</p>
    </LegalShell>
  );
}
