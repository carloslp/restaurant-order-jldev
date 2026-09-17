// src/features/notifications/email/reminder.tsx
// Placeholder for reservation reminder email.

export function ReservationReminderEmail({ 
  holderName, 
  date, 
  time, 
  locationName 
}: { 
  holderName: string; 
  date: string; 
  time: string; 
  locationName: string; 
}) {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: '20px', color: '#333' }}>
      <h1>¡Hola {holderName}!</h1>
      <p>Te recordamos tu próxima reserva en <strong>{locationName}</strong>.</p>
      <div style={{ backgroundColor: '#f4f4f4', padding: '15px', borderRadius: '8px', margin: '20px 0' }}>
        <p><strong>Fecha:</strong> {date}</p>
        <p><strong>Hora:</strong> {time}</p>
      </div>
      <p>Si necesitas realizar algún cambio o cancelar, por favor contáctanos lo antes posible.</p>
      <p>¡Te esperamos!</p>
    </div>
  );
}
