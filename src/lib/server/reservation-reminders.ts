// src/lib/server/reservation-reminders.ts
'use server';

import { createServerClient } from '@/lib/supabase/server';
import { sendReservationReminder } from './notifications';

interface Reservation {
  id: string;
  holder_name: string;
  holder_phone: string;
  reservation_date: string; // YYYY-MM-DD
  reservation_time: string; // HH:mm:ss
  preferred_zone: string;
  status: string;
  location_id: string;
}

async function getLocationName(supabase: ReturnType<typeof createServerClient>, locationId: string): Promise<string> {
  const { data } = await supabase
    .from('locals')
    .select('name')
    .eq('id', locationId)
    .single();
  return data?.name || 'Nuestro restaurante';
}

async function fetchReservationsForReminder(
  supabase: ReturnType<typeof createServerClient>,
  hoursBefore: number
): Promise<Reservation[]> {
  // Calculate the target datetime window
  const now = new Date();
  const targetTime = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000);
  
  // We need to find reservations that are approximately X hours away
  // The reservation date/time is stored separately, so we construct the timestamp
  const targetDateStr = targetTime.toISOString().split('T')[0];
  const targetTimeStr = targetTime.toTimeString().slice(0, 5); // HH:mm
  
  // Query reservations for the target date
  // We'll filter by time window in the application layer for precision
  const { data, error } = await supabase
    .from('reservations')
    .select('id, location_id, customer_name, customer_email, customer_phone, party_size, reservation_date, reservation_time, status, reminder_sent_at')
    .eq('reservation_date', targetDateStr)
    .in('status', ['PENDIENTE', 'CONFIRMADA']);
  
  if (error) {
    console.error(`[Reminder] Error fetching reservations:`, error);
    throw error;
  }
  
  if (!data || data.length === 0) {
    return [];
  }
  
  // Filter by time window (approximately hoursBefore ± 15 minutes)
  const targetMinutes = targetTime.getHours() * 60 + targetTime.getMinutes();
  const windowMinutes = 15; // 15-minute window
  
  return data.filter((res: Reservation) => {
    const resTimeParts = res.reservation_time.split(':');
    const resMinutes = parseInt(resTimeParts[0]) * 60 + parseInt(resTimeParts[1]);
    return Math.abs(resMinutes - targetMinutes) <= windowMinutes;
  });
}

export async function runReminderJob(hoursBefore: 24 | 2) {
  console.log(`[Reminder Job] Starting reminder job for ${hoursBefore}h before reservations`);
  
  const supabase = createServerClient();
  
  // Get all active locations with reservations enabled
  const { data: locations, error: locError } = await supabase
    .from('locals')
    .select('id, name, timezone')
    .eq('reservations_enabled', true);
  
  if (locError) {
    console.error(`[Reminder Job] Error fetching locations:`, locError);
    throw locError;
  }
  
  if (!locations || locations.length === 0) {
    console.log(`[Reminder Job] No locations found`);
    return { sent: 0, errors: 0 };
  }
  
  let totalSent = 0;
  let totalErrors = 0;
  
  for (const location of locations) {
    try {
      // Set the local context for RLS
      await supabase.rpc('set_config', {
        name: 'app.local_id',
        value: location.id,
        is_local: true,
      });
      
      const reservations = await fetchReservationsForReminder(supabase, hoursBefore);
      
      if (reservations.length === 0) {
        console.log(`[Reminder Job] No reservations for ${location.name} at ${hoursBefore}h`);
        continue;
      }
      
      for (const reservation of reservations) {
        try {
          await sendReservationReminder(
            reservation.holder_phone,
            null, // Email not stored in reservations yet
            {
              holderName: reservation.holder_name,
              date: reservation.reservation_date,
              time: reservation.reservation_time.slice(0, 5),
              locationName: location.name,
            }
          );
          totalSent++;
          
          // Log the reminder sent (could add a reminder_log table)
          console.log(`[Reminder Job] Sent ${hoursBefore}h reminder for reservation ${reservation.id}`);
        } catch (err) {
          console.error(`[Reminder Job] Failed to send reminder for ${reservation.id}:`, err);
          totalErrors++;
        }
      }
    } catch (err) {
      console.error(`[Reminder Job] Error processing location ${location.name}:`, err);
      totalErrors++;
    }
  }
  
  console.log(`[Reminder Job] Completed: ${totalSent} sent, ${totalErrors} errors`);
  return { sent: totalSent, errors: totalErrors };
}

// Vercel Cron endpoint - 24h reminders
export async function GET_24h() {
  return runReminderJob(24);
}

// Vercel Cron endpoint - 2h reminders
export async function GET_2h() {
  return runReminderJob(2);
}

// For Supabase pg_cron - can be called via HTTP or directly
export async function runReminders(hoursBefore: 24 | 2) {
  return runReminderJob(hoursBefore);
}