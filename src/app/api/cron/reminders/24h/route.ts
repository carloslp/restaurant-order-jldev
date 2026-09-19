// Cron de recordatorios 24h antes. Protegido con CRON_SECRET (Bearer o query ?secret=).
import { NextResponse } from 'next/server';
import { runReminderJob } from '@/lib/server/reservation-reminders';
import { verifyCronSecret } from '@/lib/server/cron-auth';
import { createLogger } from '@/lib/logger';

const logger = createLogger('cron:reminders-24h');

export async function GET(request: Request) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    logger.warn('no autorizado');
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
  }
  try {
    const result = await runReminderJob(24);
    logger.info('job completado', result);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    logger.error('job falló', error);
    return NextResponse.json({ success: false, error: 'No se pudieron enviar los recordatorios.' }, { status: 500 });
  }
}


