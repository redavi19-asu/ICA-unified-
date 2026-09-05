import { redirect } from 'next/navigation';
import { readSession } from '../../lib/auth';
import LoginClient from './LoginClient';

export default async function LoginPage() {
  const session = await readSession();

  if (session) {
    redirect('/workspace');
  }

  return <LoginClient />;
}
