// src/lib/server/notifications.ts
'use server';

export async function sendReservationReminder(
  phone: string, 
  email: string | null, 
  details: {
    holderName: string;
    date: string;
    time: string;
    locationName: string;
  }
) {
  // In a real implementation, this would call Twilio for WhatsApp and Resend/SendGrid for Email.
  
  console.log(`[Notification Service] Sending reminder to ${phone} / ${email}`);
  console.log(`Message: Hola ${details.holderName}, te recordamos tu reserva en ${details.locationName} el ${details.date} a las ${details.time}.`);

  // Simulate API call
  return { success: true };
}
