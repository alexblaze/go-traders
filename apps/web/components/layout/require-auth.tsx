'use client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { useAuth } from '@/stores/auth';

export function RequireAuth({ children, admin = false }: { children: React.ReactNode; admin?: boolean }) {
  const { user, initialized } = useAuth();
  if (!initialized) return <Skeleton className="h-40 w-full" />;
  if (!user)
    return (
      <Card className="mx-auto max-w-md">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm text-muted-foreground">Please log in to use this feature.</p>
          <div className="flex gap-2">
            <Link href="/login"><Button>Login</Button></Link>
            <Link href="/register"><Button variant="outline">Create account</Button></Link>
          </div>
        </CardContent>
      </Card>
    );
  if (admin && user.role !== 'ADMIN') return <p className="text-sm text-bear">Administrator role required.</p>;
  return <>{children}</>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
