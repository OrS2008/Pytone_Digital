// Terms of service — English and Hebrew.
//
// Posture: Nova Stream is a PLAYER. We do not host, store, distribute,
// curate, or recommend any video content. Users bring their own M3U /
// XMLTV / Xtream / Stalker sources. The four pillars (as is, user
// responsibility, no hosting, repeat-infringer policy) are the
// established posture for a bring-your-own-playlist player. Do not
// soften them without legal review.
//
// Facts checked against the code on 16 Nov 2026: 7-day trial
// (lib/session TRIAL_DAYS), monthly and yearly plans (account/plans),
// account deletion is immediate (api/privacy/delete).
// The Hebrew text is a translation awaiting legal review; the English
// text prevails (stated on the page). Change both languages together.

import Link from 'next/link';
import { headers } from 'next/headers';
import LegalShell from '../LegalShell';

export const dynamic = 'force-dynamic';

const EN = (
  <>
    <h3>1. What Nova Stream is</h3>
    <p>
      Nova Stream is a personal-use media player. It is software that lets
      you organise, play and manage your own video sources — M3U / M3U8
      playlists, XMLTV programme guides, Xtream Codes accounts, Stalker
      portals and other third-party streams you choose to add.
    </p>

    <h3>2. Service provided &quot;as is&quot;</h3>
    <p>
      Nova Stream is provided as is and as available, without warranty of
      any kind, express or implied. We do not guarantee uptime, video
      quality, the availability of any particular channel or stream, or
      compatibility with any specific provider. Our total liability to you
      is capped at the amount you paid us in the preceding twelve months.
      Nothing in these terms limits your statutory consumer rights where
      the law does not allow that limitation.
    </p>

    <h3>3. Your responsibility for the content you play</h3>
    <p>
      You are solely responsible for the playlists, programme guides,
      provider accounts and any other sources you configure in Nova Stream.
      You must have the lawful right to access any stream you play — for
      example because you hold a valid subscription with the provider,
      because the content is publicly licensed, or because the content is
      yours. We do not and cannot verify the legality of the sources you
      add.
    </p>

    <h3>4. We do not host content</h3>
    <p>
      Nova Stream does not host, store, distribute, transcode or
      re-broadcast any television channel, film, video stream or other
      media file. Nova Stream is the player — your provider is the source
      of the video. When you press play, the application connects to the
      provider you configured, directly or through our relay, which passes
      the stream on without storing it.
    </p>

    <h3>5. Your account</h3>
    <p>
      One account per person. You are responsible for keeping your
      sign-in details secret and for activity under your account. You can
      delete the account at any time from{' '}
      <Link href="/tv/account/help" className="ac-auth-link">Settings → Help</Link>;
      deletion takes effect immediately and cannot be undone.
    </p>

    <h3>6. Acceptable use</h3>
    <p>
      You will not use Nova Stream to redistribute, rebroadcast or
      commercially exploit content you do not own or have the right to
      share, to circumvent technical or geographic restrictions imposed by
      your provider, or to facilitate unlawful activity.
    </p>

    <h3>7. Repeat-infringer policy</h3>
    <p>
      We respond to credible copyright complaints under applicable law
      (including the U.S. DMCA, the EU Copyright Directive and equivalent
      national regimes). Accounts that repeatedly receive credible
      complaints about the sources they configure will be terminated.
      Notices: dmca@novastream.tv.
    </p>

    <h3>8. Trial and billing</h3>
    <p>
      A 7-day free trial begins when you create the account. To keep using
      the service afterwards you choose a paid plan, billed in advance
      monthly or yearly through Stripe. You can cancel at any time from
      your account settings; access continues until the end of the period
      you have paid for.
    </p>

    <h3>9. Changes</h3>
    <p>
      If we change these terms materially we will tell you in the app at
      least 30 days before they take effect. Continued use after that
      notice counts as acceptance.
    </p>

    <h3>10. Contact</h3>
    <p>
      General questions: support@novastream.tv · Copyright notices:
      dmca@novastream.tv · Privacy and data-rights requests:
      privacy@novastream.tv.
    </p>
  </>
);

const HE = (
  <>
    <h3>1. מהו Nova Stream</h3>
    <p>
      Nova Stream הוא נגן מדיה לשימוש אישי. זוהי תוכנה שמאפשרת לכם לארגן,
      לנגן ולנהל את מקורות הווידאו שלכם — פלייליסטים מסוג M3U / M3U8,
      מדריכי שידורים בפורמט XMLTV, חשבונות Xtream Codes, פורטלי Stalker
      ושידורים נוספים של צדדים שלישיים שתבחרו להוסיף.
    </p>

    <h3>2. השירות ניתן &quot;כמות שהוא&quot;</h3>
    <p>
      Nova Stream ניתן כמות שהוא (AS IS) ובכפוף לזמינותו, ללא אחריות מכל
      סוג, מפורשת או משתמעת. איננו מתחייבים לזמינות השירות, לאיכות הווידאו,
      לזמינותו של ערוץ או שידור מסוים או להתאמה לספק מסוים. אחריותנו
      הכוללת כלפיכם מוגבלת לסכום ששילמתם לנו בשנים-עשר החודשים שקדמו
      לאירוע. אין בתנאים אלה כדי לגרוע מזכויותיכם כצרכנים על פי דין, ככל
      שהדין אינו מתיר הגבלה כזו.
    </p>

    <h3>3. האחריות שלכם לתוכן שאתם מנגנים</h3>
    <p>
      האחריות הבלעדית לפלייליסטים, למדריכי השידורים, לחשבונות הספקים ולכל
      מקור אחר שתגדירו ב-Nova Stream היא שלכם. עליכם להחזיק בזכות חוקית
      לצפות בכל שידור שאתם מנגנים — למשל משום שיש לכם מנוי בתוקף אצל
      הספק, משום שהתוכן מורשה לשימוש הציבור או משום שהתוכן שלכם. איננו
      בודקים, ואיננו יכולים לבדוק, את חוקיות המקורות שאתם מוסיפים.
    </p>

    <h3>4. איננו מארחים תוכן</h3>
    <p>
      Nova Stream אינו מארח, מאחסן, מפיץ, מקודד מחדש או משדר מחדש ערוצי
      טלוויזיה, סרטים, שידורי וידאו או קובצי מדיה אחרים. Nova Stream הוא
      הנגן — הספק שלכם הוא מקור הווידאו. כשאתם לוחצים על ניגון, האפליקציה
      מתחברת לספק שהגדרתם, ישירות או דרך שרת התיווך שלנו, שמעביר את השידור
      הלאה בלי לשמור אותו.
    </p>

    <h3>5. החשבון שלכם</h3>
    <p>
      חשבון אחד לכל אדם. האחריות לשמירת פרטי ההתחברות בסוד ולפעולות
      שמתבצעות בחשבונכם היא שלכם. אפשר למחוק את החשבון בכל עת דרך{' '}
      <Link href="/tv/account/help" className="ac-auth-link">הגדרות ← עזרה</Link>;
      המחיקה נכנסת לתוקף מיד ואי אפשר לבטל אותה.
    </p>

    <h3>6. שימוש מותר</h3>
    <p>
      לא תשתמשו ב-Nova Stream כדי להפיץ, לשדר מחדש או לנצל מסחרית תוכן
      שאינו שלכם או שאין לכם זכות לשתף, כדי לעקוף מגבלות טכניות או
      גיאוגרפיות שהספק שלכם מטיל, או כדי לסייע לפעילות בלתי חוקית.
    </p>

    <h3>7. מדיניות הפרות חוזרות</h3>
    <p>
      אנחנו מטפלים בתלונות מבוססות על הפרת זכויות יוצרים בהתאם לדין החל
      (לרבות ה-DMCA האמריקאי, הדירקטיבה האירופית בדבר זכויות יוצרים
      והסדרים לאומיים מקבילים). חשבונות שלגביהם מתקבלות שוב ושוב תלונות
      מבוססות על המקורות שהוגדרו בהם ייסגרו. הודעות: dmca@novastream.tv.
    </p>

    <h3>8. תקופת ניסיון וחיוב</h3>
    <p>
      תקופת ניסיון חינם של 7 ימים מתחילה עם פתיחת החשבון. כדי להמשיך
      להשתמש בשירות לאחר מכן בוחרים תוכנית בתשלום, שמחויבת מראש באופן
      חודשי או שנתי באמצעות Stripe. אפשר לבטל בכל עת מהגדרות החשבון;
      הגישה נמשכת עד סוף התקופה ששולמה.
    </p>

    <h3>9. שינויים</h3>
    <p>
      אם נשנה את התנאים באופן מהותי, נודיע על כך באפליקציה לפחות 30 יום
      לפני כניסתם לתוקף. המשך השימוש לאחר ההודעה ייחשב כהסכמה.
    </p>

    <h3>10. יצירת קשר</h3>
    <p>
      שאלות כלליות: support@novastream.tv · הודעות בנושא זכויות יוצרים:
      dmca@novastream.tv · פרטיות ומימוש זכויות: privacy@novastream.tv.
    </p>
  </>
);

export default async function Terms() {
  const accept = (await headers()).get('accept-language') ?? '';
  return (
    <LegalShell
      initialLocale={/^\s*he\b/i.test(accept) ? 'he' : 'en'}
      title={{ en: 'Terms of service', he: 'תנאי שימוש' }}
      en={EN}
      he={HE}
    />
  );
}
