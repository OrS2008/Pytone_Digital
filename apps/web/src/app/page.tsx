import { redirect } from 'next/navigation';

// The bare domain redirects to the TV experience — that's the canonical
// entry for every device class (TV, mobile, desktop browser).
export default function Root() {
  redirect('/tv');
}
