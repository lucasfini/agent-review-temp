import Link from 'next/link';
import { Building2, FolderKanban, Palette, Sparkles } from 'lucide-react';
import { DashboardPageHeader, DashboardPageShell, DashboardPanel } from '@/components/dashboard/shell';

const studioLinks = [
  {
    href: '/dashboard/studio/profile',
    title: 'Profile',
    description: 'Brand, audience, and workspace context.',
    Icon: Building2,
  },
  {
    href: '/dashboard/studio/voice',
    title: 'Voice',
    description: 'Reusable voice and tone settings.',
    Icon: Palette,
  },
  {
    href: '/dashboard/studio/plans',
    title: 'Plans',
    description: 'Reusable campaign and content plans.',
    Icon: FolderKanban,
  },
];

export default function StudioPage() {
  return (
    <DashboardPageShell maxWidth="7xl">
      <DashboardPageHeader
        icon={Sparkles}
        title="Studio"
        description="Build reusable workflows, prompts, and content production setups."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {studioLinks.map(({ href, title, description, Icon }) => (
          <DashboardPanel key={href} className="bg-white p-5 text-slate-900 dark:bg-slate-950/60 dark:text-slate-100">
            <Link href={href} className="group block">
              <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-200">
                <Icon className="h-5 w-5" />
              </span>
              <h2 className="text-lg font-semibold text-slate-950 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-200">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{description}</p>
            </Link>
          </DashboardPanel>
        ))}
      </div>
    </DashboardPageShell>
  );
}
