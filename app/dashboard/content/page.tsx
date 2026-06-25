import { redirect } from 'next/navigation';

export default function DashboardContentRedirectPage() {
  redirect('/dashboard/hub');
}
