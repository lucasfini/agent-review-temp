import { redirect } from 'next/navigation';

export default function OnboardingRedirectPage() {
  redirect('/dashboard/studio/profile');
}
