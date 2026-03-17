import { redirect } from 'next/navigation';

export default function AdminDataLegacyRedirect() {
  redirect('/admin/billing-ops');
}
