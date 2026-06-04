// Terms of Service for Nova Stream.
//
// Posture: Nova Stream is a PLAYER. We do not host, store, distribute,
// curate, or recommend any video content. Users bring their own M3U /
// XMLTV / Xtream sources. The four pillars (AS IS, user responsibility,
// no hosting, repeat-infringer policy) mirror the language VLC,
// Stremio, ClouDDy, TiviMate-clones use — this is the established safe
// posture for a BYO-playlist player and the language counsel will
// recognise.
//
// This page is a static legal disclosure. It does not collect data and
// does not require auth. Do not soften the four pillars without legal
// review.

import Link from 'next/link';
import '../../tv/account/account.css';

export default function Terms() {
  return (
    <main className="ac-auth" style={{ alignItems: 'flex-start', padding: '64px 24px' }}>
      <div className="ac-auth-card" style={{ maxWidth: 760 }}>
        <div className="ac-auth-wm">NOVA STREAM</div>
        <h1 className="ac-auth-title" style={{ marginTop: 12 }}>Terms of service</h1>
        <p className="ac-auth-sub" style={{ marginBottom: 24 }}>
          Last updated · {new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>

        <section style={{ lineHeight: 1.7 }}>
          <h3 style={{ marginTop: 28 }}>1. What Nova Stream is</h3>
          <p>
            Nova Stream is a personal-use media player. It is a piece of
            software that lets you organise, play, and manage your own video
            sources — M3U / M3U8 playlists, XMLTV electronic programme
            guides, Xtream Codes accounts, Stalker portals, and other
            third-party streams you choose to add.
          </p>

          <h3 style={{ marginTop: 28 }}>2. Service provided &quot;as is&quot;</h3>
          <p>
            Nova Stream is provided as is and as available, without warranty
            of any kind, express or implied. We do not guarantee uptime,
            video quality, the availability of any particular channel or
            stream, or compatibility with any specific provider. Our total
            liability to you is capped at the amount you paid us in the
            trailing twelve months. Nothing in these terms limits your
            statutory consumer rights where the law does not allow that
            limitation.
          </p>

          <h3 style={{ marginTop: 28 }}>3. Your responsibility for the content you play</h3>
          <p>
            You are solely responsible for the M3U URLs, EPG sources, and
            any other content you configure within Nova Stream. You must
            ensure that you have the lawful right to access any stream you
            play through this application — for example because you have a
            valid subscription with the provider, because the content is
            publicly licensed, or because the content is yours. We do not
            and cannot verify the legality of streams you add.
          </p>

          <h3 style={{ marginTop: 28 }}>4. We do not host content</h3>
          <p>
            Nova Stream does not host, store, distribute, transcode, or
            re-broadcast any television channel, movie, video stream, or
            other media file. Nova Stream is the player — your provider is
            the source of the video. When you press play, the application
            connects to the provider you configured. We are not a party to
            that connection beyond delivering the player software.
          </p>

          <h3 style={{ marginTop: 28 }}>5. Your account</h3>
          <p>
            One account per person. You are responsible for keeping your
            password secret and for activity that occurs under your
            account. You can delete the account at any time from
            <Link href="/tv/account/help" className="ac-auth-link"> Settings → Help &amp; legal → Danger zone</Link>;
            deletion is permanent and irreversible after 30 days.
          </p>

          <h3 style={{ marginTop: 28 }}>6. Acceptable use</h3>
          <p>
            You will not use Nova Stream to redistribute, rebroadcast, or
            commercially exploit content you do not own or have the right
            to share. You will not attempt to circumvent technical or
            geographic restrictions imposed by your provider. You will not
            use Nova Stream to facilitate or organise unlawful activity.
          </p>

          <h3 style={{ marginTop: 28 }}>7. Repeat-infringer policy</h3>
          <p>
            We respond to credible copyright complaints under applicable
            law (including the U.S. DMCA, the EU Copyright Directive, and
            equivalent national regimes). Accounts that repeatedly receive
            credible complaints regarding the streams they configure will
            be terminated. Notices can be sent to our designated agent at
            dmca@novastream.tv.
          </p>

          <h3 style={{ marginTop: 28 }}>8. Trial &amp; billing</h3>
          <p>
            A free trial begins when you create the account. After it
            ends, billing is monthly in advance if you have chosen a paid
            plan. You can cancel at any time from your account settings;
            access continues until the end of the paid period.
          </p>

          <h3 style={{ marginTop: 28 }}>9. Changes</h3>
          <p>
            If we change these terms materially we will notify you in the
            app at least 30 days before they take effect. Continued use of
            the service after that notice counts as acceptance.
          </p>

          <h3 style={{ marginTop: 28 }}>10. Contact</h3>
          <p>
            General questions: support@novastream.tv. Copyright notices:
            dmca@novastream.tv. Privacy and data-rights requests:
            privacy@novastream.tv.
          </p>
        </section>

        <div className="ac-auth-bottom" style={{ marginTop: 40 }}>
          <Link href="/tv/signup" className="ac-auth-link">← Back to sign-up</Link>
        </div>
      </div>
    </main>
  );
}
