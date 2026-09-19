// Cron de recordatorios 24h antes. Protegido con CRON_SECRET (Bearer o query ?secret=).
// Si CRON_SECRET no está configurado, el endpoint queda abierto SOLO en desarrollo.
import { NextResponse } from 'next/server';
import { runReminderJob } from '@/lib/server/reservation-reminders';
import { verifyCronSecret } from '@/lib/server/cron-auth';

export async function GET(request: Request) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
  }
  try {
    const result = await runReminderJob(24);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('cron/reminders/24h:', error);
    return NextResponse.json({ success: false, error: 'No se pudieron enviar los recordatorios.' }, { status: 500 });
  }
}

