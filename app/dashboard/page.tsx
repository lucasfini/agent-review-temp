import { redirect } from 'next/navigation';

/**
 * Dashboard Root Page
 * Redirects to the Project Hub (new main landing page)
 */
export default function DashboardPage() {
  redirect('/dashboard/hub');
}
