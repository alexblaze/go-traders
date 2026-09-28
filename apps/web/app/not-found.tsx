import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link href="/" className="text-primary hover:underline">Back to dashboard</Link>
    </div>
  );
}
