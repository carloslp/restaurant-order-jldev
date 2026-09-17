import { NextResponse } from 'next/server';
import { runReminderJob } from '@/lib/server/reservation-reminders';

export async function GET() {
  try {
    const result = await runReminderJob(2);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
