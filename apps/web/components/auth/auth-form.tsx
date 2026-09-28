'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/inputs';
import { api, ApiError } from '@/lib/api';
import { useAuth, type SessionUser } from '@/stores/auth';

const LoginSchema = z.object({ email: z.string().email('Enter a valid email'), password: z.string().min(1, 'Password is required') });
const RegisterSchema = z.object({
  name: z.string().max(100).optional(),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters').regex(/[A-Za-z]/, 'Include a letter').regex(/[0-9]/, 'Include a digit'),
});
type FormValues = { name?: string; email: string; password: string };

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(mode === 'login' ? LoginSchema : RegisterSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const payload = { email: values.email, password: values.password, ...(mode === 'register' && values.name?.trim() ? { name: values.name.trim() } : {}) };
      const data = await api.post<{ accessToken: string; user: SessionUser }>(`/auth/${mode}`, payload);
      setSession(data.accessToken, data.user);
      router.push('/');
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : 'Something went wrong');
    }
  });

  return (
    <Card className="mx-auto mt-10 w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-lg">{mode === 'login' ? 'Log in' : 'Create an account'}</CardTitle>
        <CardDescription>Research platform for NEPSE technical analysis. Not financial advice.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
          {mode === 'register' && (
            <Field label="Name (optional)"><Input autoComplete="name" {...register('name')} /></Field>
          )}
          <Field label="Email" error={formState.errors.email?.message}><Input type="email" autoComplete="email" {...register('email')} /></Field>
          <Field label="Password" error={formState.errors.password?.message} hint={mode === 'register' ? 'Min 8 characters with a letter and a digit' : undefined}>
            <Input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} {...register('password')} />
          </Field>
          {serverError && <p role="alert" className="text-xs text-bear">{serverError}</p>}
          <Button type="submit" disabled={formState.isSubmitting}>{formState.isSubmitting ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</Button>
          <p className="text-center text-xs text-muted-foreground">
            {mode === 'login' ? <>No account? <Link className="text-primary" href="/register">Register</Link></> : <>Have an account? <Link className="text-primary" href="/login">Log in</Link></>}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
