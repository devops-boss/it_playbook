import Link from 'next/link';
import { IconArrowLeft, IconCompass } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm ring-8 ring-primary/5">
        <IconCompass className="h-8 w-8 stroke-[1.5]" />
      </div>
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        Page Not Found
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed">
        The scenario, account, or playbook view you requested does not exist or has been moved.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Button asChild variant="default" size="sm" className="gap-2">
          <Link href="/">
            <IconArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
