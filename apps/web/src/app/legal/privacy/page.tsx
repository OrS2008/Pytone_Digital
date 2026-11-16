// Privacy policy — English and Hebrew.
//
// Every statement here must match the code. Checked against the code on
// 16 Nov 2026: Firebase Authentication holds passwords (lib/auth/users),
// settings and provider connections are AES-256-GCM encrypted at rest
// (lib/secretBox, settingsStore, providers/store), application logs carry
// no IPs / emails / stream URLs (lib/log), session records keep the
// user agent and sign-in IP until expiry, deletion is immediate
// (api/privacy/delete), sessions last 30 days (auth/serverSession).
// The Hebrew text is a translation awaiting legal review; the English
// text prevails (stated on the page). Change both languages together.

import Link from 'next/link';
import { headers } from 'next/headers';
import LegalShell from '../LegalShell';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const help = (label: string) => <Link href="/tv/account/help" className="ac-auth-link">{label}</Link>;

const EN = (
  <>
    <h3>The short version</h3>
    <p>
      Nova Stream is a player. We do not host video, sell your data or use
      advertising trackers. We keep only what is needed to give you an
      account that follows you between devices, and we encrypt the
      sensitive parts.
    </p>

    <h3>What we hold</h3>
    <ul>
      <li><b>Account:</b> your email address, an account identifier, the date you signed up, and your trial / subscription status. Sign-in is handled by Google Firebase Authentication: Firebase stores your password (or your Google sign-in), we do not. Accounts created before that change may still carry a salted password hash on our side until they are migrated.</li>
      <li><b>Settings:</b> the playlist and programme-guide addresses you add, display and playback preferences, favourites, channel groups, programme reminders, recent searches, resume positions and parental-control settings. They synchronise across your devices and are stored encrypted (AES-256-GCM).</li>
      <li><b>Provider connections:</b> the server address, username and password of an Xtream Codes account, or the portal address and MAC of a Stalker portal, if you connect one. Stored encrypted and never sent back to your device; the app uses them on the server to fetch lists and to create playback links.</li>
      <li><b>Sessions:</b> a random token in an HTTP-only, Secure, SameSite=Strict cookie, valid for 30 days. With each session we store the browser description and the IP address used at sign-in, so you can recognise your devices and sign them out; they are deleted when the session ends.</li>
      <li><b>Billing:</b> payments are processed by Stripe. We never see your card number; we keep the Stripe customer reference and the date your subscription runs until.</li>
      <li><b>Technical logs:</b> when a request fails or is refused we log the event, the request path, the status and an identifier that cannot be turned back into your account. Our application logs do not contain your IP address, email address or the addresses of your streams.</li>
    </ul>

    <h3>What we do not collect</h3>
    <p>
      No microphone or camera recordings (voice search is processed by
      your browser), no contacts, no browsing history outside the app, no
      third-party analytics or advertising SDKs. When video passes through
      our proxy it is relayed, not recorded.
    </p>

    <h3>Who processes it for us</h3>
    <ul>
      <li><b>Cloudflare, Inc.</b> — hosting and data storage (Cloudflare KV). As a network provider Cloudflare processes IP addresses to deliver the service, under its{' '}
        <a className="ac-auth-link" href="https://www.cloudflare.com/cloudflare-customer-dpa/">Data Processing Addendum</a>.</li>
      <li><b>Google (Firebase Authentication)</b> — account sign-in, password storage and verification emails.</li>
      <li><b>Stripe, Inc.</b> — payment processing.</li>
    </ul>

    <h3>How long we keep it</h3>
    <p>
      Until you delete your account. Sessions expire after 30 days.
      Stripe keeps payment records for as long as financial law requires.
    </p>

    <h3>Your rights</h3>
    <ul>
      <li><b>Access and portability:</b> {help('Settings → Help → Export my data')} downloads a file with everything we hold about you, immediately.</li>
      <li><b>Erasure:</b> {help('Settings → Help → Delete my account')} deletes your account, settings, provider connections, sessions and history straight away, and your Firebase sign-in.</li>
      <li><b>Correction:</b> change any setting in the app, or write to privacy@novastream.tv.</li>
      <li><b>Complaint:</b> you may complain to your data-protection authority — in Israel the Privacy Protection Authority; in the EU your national supervisory authority.</li>
    </ul>

    <h3>Children</h3>
    <p>
      The service is not directed at children under 13 and we do not
      knowingly collect their data. If you believe a child has created an
      account, write to privacy@novastream.tv and we will delete it.
    </p>

    <h3>Changes</h3>
    <p>We will tell you in the app at least 30 days before a material change takes effect.</p>

    <h3>Contact</h3>
    <p>privacy@novastream.tv</p>
  </>
);

const HE = (
  <>
    <h3>בקצרה</h3>
    <p>
      Nova Stream הוא נגן. איננו מארחים וידאו, איננו מוכרים את המידע שלכם
      ואיננו משתמשים במעקב פרסומי. אנחנו שומרים רק את מה שנדרש כדי לתת
      לכם חשבון שעובר איתכם בין מכשירים, ומצפינים את החלקים הרגישים.
    </p>

    <h3>מה אנחנו שומרים</h3>
    <ul>
      <li><b>חשבון:</b> כתובת הדוא״ל, מזהה חשבון, תאריך ההרשמה ומצב תקופת הניסיון או המנוי. ההתחברות מתבצעת באמצעות Google Firebase Authentication: הסיסמה (או ההתחברות עם Google) נשמרת אצל Firebase, לא אצלנו. בחשבונות שנוצרו לפני המעבר עשוי עדיין להישמר אצלנו גיבוב סיסמה מומלח, עד שיועברו.</li>
      <li><b>הגדרות:</b> כתובות הפלייליסטים ומדריכי השידורים שהוספתם, העדפות תצוגה וניגון, מועדפים, קבוצות ערוצים, תזכורות לתוכניות, חיפושים אחרונים, נקודות המשך צפייה והגדרות בקרת הורים. ההגדרות מסונכרנות בין המכשירים ונשמרות מוצפנות (AES-256-GCM).</li>
      <li><b>חיבורי ספקים:</b> כתובת השרת, שם המשתמש והסיסמה של חשבון Xtream Codes, או כתובת הפורטל וה-MAC של פורטל Stalker, אם חיברתם כזה. נשמרים מוצפנים ולעולם אינם נשלחים חזרה למכשיר; האפליקציה משתמשת בהם בשרת כדי לטעון רשימות וליצור קישורי ניגון.</li>
      <li><b>התחברויות:</b> אסימון אקראי בעוגייה מסוג HTTP-only, Secure, SameSite=Strict, בתוקף ל-30 יום. עם כל התחברות אנחנו שומרים את תיאור הדפדפן ואת כתובת ה-IP שממנה התחברתם, כדי שתוכלו לזהות את המכשירים שלכם ולנתק אותם; הם נמחקים כשההתחברות מסתיימת.</li>
      <li><b>חיוב:</b> התשלומים מעובדים על ידי Stripe. איננו רואים את מספר הכרטיס; אנחנו שומרים את מזהה הלקוח ב-Stripe ואת התאריך שעד אליו המנוי בתוקף.</li>
      <li><b>יומנים טכניים:</b> כשבקשה נכשלת או נדחית אנחנו רושמים את האירוע, נתיב הבקשה, הסטטוס ומזהה שאי אפשר לשחזר ממנו את החשבון שלכם. היומנים שלנו אינם כוללים כתובת IP, כתובת דוא״ל או כתובות של שידורים.</li>
    </ul>

    <h3>מה איננו אוספים</h3>
    <p>
      אין הקלטות מיקרופון או מצלמה (החיפוש הקולי מעובד בדפדפן שלכם), אין
      אנשי קשר, אין היסטוריית גלישה מחוץ לאפליקציה ואין ערכות אנליטיקה או
      פרסום של צד שלישי. וידאו שעובר דרך שרת התיווך שלנו מועבר הלאה ואינו
      מוקלט.
    </p>

    <h3>מי מעבד את המידע עבורנו</h3>
    <ul>
      <li><b>Cloudflare, Inc.</b> — אירוח ואחסון נתונים (Cloudflare KV). כספקית רשת, Cloudflare מעבדת כתובות IP כדי לספק את השירות, בהתאם ל-{' '}
        <a className="ac-auth-link" href="https://www.cloudflare.com/cloudflare-customer-dpa/">נספח עיבוד הנתונים</a> שלה.</li>
      <li><b>Google (Firebase Authentication)</b> — התחברות לחשבון, שמירת סיסמאות ודוא״ל אימות.</li>
      <li><b>Stripe, Inc.</b> — עיבוד תשלומים.</li>
    </ul>

    <h3>כמה זמן נשמר המידע</h3>
    <p>
      עד שתמחקו את החשבון. התחברויות פגות לאחר 30 יום. Stripe שומרת
      רשומות תשלום ככל שדיני הכספים מחייבים.
    </p>

    <h3>הזכויות שלכם</h3>
    <ul>
      <li><b>עיון וניידות:</b> {help('הגדרות ← עזרה ← ייצוא הנתונים שלי')} מוריד מיד קובץ עם כל מה שאנחנו שומרים עליכם.</li>
      <li><b>מחיקה:</b> {help('הגדרות ← עזרה ← מחיקת החשבון')} מוחק מיד את החשבון, ההגדרות, חיבורי הספקים, ההתחברויות וההיסטוריה, וגם את חשבון ההתחברות ב-Firebase.</li>
      <li><b>תיקון:</b> שנו כל הגדרה באפליקציה, או כתבו אל privacy@novastream.tv.</li>
      <li><b>תלונה:</b> באפשרותכם להתלונן בפני רשות הגנת המידע — בישראל הרשות להגנת הפרטיות; באיחוד האירופי רשות הפיקוח הלאומית.</li>
    </ul>

    <h3>ילדים</h3>
    <p>
      השירות אינו מיועד לילדים מתחת לגיל 13 ואיננו אוספים ביודעין מידע
      עליהם. אם לדעתכם ילד פתח חשבון, כתבו אל privacy@novastream.tv ונמחק
      אותו.
    </p>

    <h3>שינויים</h3>
    <p>נודיע באפליקציה לפחות 30 יום לפני ששינוי מהותי ייכנס לתוקף.</p>

    <h3>יצירת קשר</h3>
    <p>privacy@novastream.tv</p>
  </>
);

export default async function Privacy() {
  const accept = (await headers()).get('accept-language') ?? '';
  return (
    <LegalShell
      initialLocale={/^\s*he\b/i.test(accept) ? 'he' : 'en'}
      title={{ en: 'Privacy policy', he: 'מדיניות פרטיות' }}
      en={EN}
      he={HE}
    />
  );
}
