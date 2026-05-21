import type { Channel } from './types';

// Mock channels for dev preview. Mirrors what real Israeli HOT/YES users
// would see at the top of the list. Replace with a real fetch from the
// gateway when the playlist service is wired in.

function p(title: string, startMinAgo: number, durMin: number, desc?: string) {
  const start = new Date(Date.now() - startMinAgo * 60_000);
  const stop  = new Date(start.getTime() + durMin * 60_000);
  return { id: title.replace(/\s+/g, '-'), title, start, stop, description: desc, catchupAvailable: true };
}

export const MOCK_CHANNELS: Channel[] = [
  {
    id: 'kan11',
    number: 11,
    name: 'כאן 11',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Kan_11_logo_2017.svg/120px-Kan_11_logo_2017.svg.png',
    category: 'General',
    now:   p('חדשות 11 — מהדורת ערב', 18, 30, 'מהדורת החדשות המרכזית של תאגיד השידור הציבורי, בהגשת רינה מצליח.'),
    next1: p('עובדה', -12, 60),
    next2: p('שעת חדשות', -72, 60),
  },
  {
    id: 'kesh12',
    number: 12,
    name: 'קשת 12',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Keshet_12_logo.svg/120px-Keshet_12_logo.svg.png',
    category: 'General',
    now:   p('חדשות 12 — המהדורה המרכזית', 22, 45, 'דנה ויס ויונית לוי עם החדשות.'),
    next1: p('האח הגדול', -23, 90),
    next2: p('סרט הערב — לה לה לנד', -113, 120),
  },
  {
    id: 'reshet13',
    number: 13,
    name: 'רשת 13',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Reshet_13_logo.svg/120px-Reshet_13_logo.svg.png',
    category: 'General',
    now:   p('חדשות 13', 25, 45),
    next1: p('זמן אמת', -20, 60),
    next2: p('הזירה', -80, 60),
  },
  {
    id: 'sport1',
    number: 21,
    name: 'ספורט 1',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/he/thumb/1/13/Sport_1_logo.png/120px-Sport_1_logo.png',
    category: 'Sports',
    now:   p('פרמייר ליג: ארסנל נגד מנצ\'סטר סיטי', 35, 105, 'משחק הצמרת השבועי, שידור חי מהאמירויות סטדיום.'),
    next1: p('שעת ספורט', -70, 30),
    next2: p('NBA: לייקרס נגד סלטיקס', -100, 150),
  },
  {
    id: 'one',
    number: 22,
    name: 'ONE',
    logoUrl: '',
    category: 'Sports',
    now:   p('האולפן של ONE', 10, 60),
    next1: p('כדורגל ישראלי: מכבי חיפה — הפועל ת\"א', -50, 105),
    next2: p('סיכום שבועי', -155, 60),
  },
  {
    id: 'yes-movies',
    number: 31,
    name: 'yes Movies Action',
    logoUrl: '',
    category: 'Movies',
    now:   p('ג\'ון וויק: פרק 4', 42, 169, 'פעולה. קיאנו ריבס חוזר לתפקיד המתנקש האגדי.'),
    next1: p('משימה בלתי אפשרית: דין סופי', -127, 165),
    next2: p('סדרת הטופ גאן', -292, 130),
  },
  {
    id: 'yes-kids',
    number: 41,
    name: 'yoyo',
    logoUrl: '',
    category: 'Kids',
    now:   p('פאוורפאף גירלז', 8, 30),
    next1: p('בלי סוד', -22, 30),
    next2: p('דורה החוקרת', -52, 30),
  },
  {
    id: 'docu',
    number: 51,
    name: 'National Geographic',
    logoUrl: '',
    category: 'Documentary',
    now:   p('Planet Earth III — Ocean', 14, 60),
    next1: p('Cosmos: A Spacetime Odyssey', -46, 60),
    next2: p('Free Solo', -106, 100),
  },
  {
    id: 'news-i24',
    number: 61,
    name: 'i24 News',
    logoUrl: '',
    category: 'News',
    now:   p('Global Brief', 0, 60),
    next1: p('The Rundown', -60, 30),
    next2: p('Strictly Security', -90, 30),
  },
  {
    id: 'music',
    number: 71,
    name: 'MTV Live',
    logoUrl: '',
    category: 'Music',
    now:   p('Top 40 Countdown', 27, 60),
    next1: p('Throwback Hours', -33, 90),
    next2: p('Live in Concert', -123, 60),
  },
];
