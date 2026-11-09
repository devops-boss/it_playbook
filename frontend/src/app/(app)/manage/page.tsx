import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import {
  IconBuilding,
  IconFolder,
  IconShieldCheck,
  IconSettings,
  IconArrowRight,
  IconUsers,
} from '@tabler/icons-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function ManageHubPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const manageSections = [
    {
      title: 'Accounts',
      description: 'Manage client accounts, brand colors, ticketing templates, and active status.',
      href: '/admin/accounts',
      icon: IconBuilding,
    },
    {
      title: 'Categories',
      description: 'Organize troubleshooting scenarios into hierarchical category trees.',
      href: '/admin/categories',
      icon: IconFolder,
    },
    {
      title: 'Criteria Builder',
      description: 'Configure classification criteria, custom dropdowns, and filtering tags.',
      href: '/admin/criteria',
      icon: IconShieldCheck,
    },
    {
      title: 'Settings',
      description: 'System configurations, audit options, and application preferences.',
      href: '/admin/settings',
      icon: IconSettings,
    },
  ];

  if (user.isSuperAdmin) {
    manageSections.push({
      title: 'Users & Roles',
      description: 'Administer team accounts, roles (Admin / IT Support), and MFA security.',
      href: '/admin/users',
      icon: IconUsers,
    });
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Manage Playbook</h1>
          <p className="text-xs text-muted-foreground mt-1">
            System management and data configuration screens.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {manageSections.map((sec) => (
            <Link key={sec.href} href={sec.href} className="group">
              <Card className="h-full transition-all duration-150 hover:border-primary/50 hover:shadow-sm">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <sec.icon className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-sm font-semibold">{sec.title}</CardTitle>
                    </div>
                    <IconArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-1">
                  <CardDescription className="text-xs">{sec.description}</CardDescription>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
