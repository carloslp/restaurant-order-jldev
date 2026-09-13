// ── Email de confirmación de pedido (react-email / resend) ─────────────
// Se envía por Supabase Auth (confirmación) o por Server Action (pedido creado).
// Deep links: wa.me / tel: — sin proveedor de mensajería en v1.

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components';

interface OrderConfirmationEmailProps {
  localName: string;
  customerName: string;
  orderNumber: string; // ej. "#0042"
  orderTypeLabel: string; // "Recoger" o "A domicilio"
  etaLabel: string; // "20:15" (hora local del restaurante)
  total: string; // "MXN 320.00"
  trackUrl: string; // URL pública con token de seguimiento
  deliveryTokenUrl?: string; // solo si es a domicilio (token del repartidor)
  isDelivery: boolean;
}

export function OrderConfirmationEmail({
  localName,
  customerName,
  orderNumber,
  orderTypeLabel,
  etaLabel,
  total,
  trackUrl,
  deliveryTokenUrl,
  isDelivery,
}: OrderConfirmationEmailProps) {
  return (
    <Html lang="es">
      <Head />
      <Preview>
        {localName} — Pedido {orderNumber} · {orderTypeLabel} · ETA {etaLabel}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Img
            src={`https://${localName.toLowerCase()}.midominio.com/logo.png`}
            width="120"
            height="40"
            alt={localName}
            style={{ marginBottom: 16 }}
          />
          <Heading style={h1}>¡Gracias, {customerName}! 🍔</Heading>
          <Text style={paragraph}>
            Tu pedido <strong>{orderNumber}</strong> ({orderTypeLabel}) está confirmado.
            <br />
            Hora estimada: <strong>{etaLabel}</strong> · Total a pagar: <strong>{total}</strong>{' '}
            (IVA incluido — propina no incluida).
          </Text>

          <Section style={box}>
            <Button href={trackUrl} style={button}>
              Seguir mi pedido
            </Button>
          </Section>

          {isDelivery && deliveryTokenUrl ? (
            <Section style={boxMuted}>
              <Text style={small}>
                📦 Link del repartidor (un solo uso — no lo compartas):
              </Text>
              <Button href={deliveryTokenUrl} style={buttonGhost}>
                Confirmar entrega
              </Button>
            </Section>
          ) : null}

          <Hr style={hr} />
          <Text style={footer}>
            ¿Dudas? Llamanos al <a href="tel:+525500000000">55 0000 0000</a> o por{' '}
            <a href="https://wa.me/525500000000">WhatsApp</a>.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// ── Estilos (valores por defecto de react-email) ────────────────────────

const main = { backgroundColor: '#f6f6f6', fontFamily: 'Arial, sans-serif', padding: '24px 0' } as const;

const container = { backgroundColor: '#ffffff', margin: '0 auto', padding: '24px', maxWidth: '480px' } as const;

const h1 = { color: '#1f2937', fontSize: '24px', lineHeight: 1.3, margin: '0 0 12px' } as const;

const paragraph = { color: '#374151', fontSize: '15px', lineHeight: 1.6, margin: '0 0 20px' } as const;

const box = { backgroundColor: '#fff7ed', borderRadius: 8, padding: '16px', textAlign: 'center' as const, margin: '0 0 16px' } as const;

const boxMuted = { backgroundColor: '#f3f4f6', borderRadius: 8, padding: '16px', textAlign: 'center' as const, margin: '0 0 16px' } as const;

const button = { backgroundColor: '#ea580c', color: '#ffffff', borderRadius: 8, padding: '10px 20px', textDecoration: 'none', fontWeight: 600, display: 'inline-block' } as const;

const buttonGhost = { ...button, backgroundColor: '#111827', marginTop: 8 } as const;

const small = { color: '#6b7280', fontSize: '12px', margin: '0 0 8px' } as const;

const hr = { borderColor: '#e5e7eb', margin: '24px 0' } as const;

const footer = { color: '#9ca3af', fontSize: '12px', margin: '0', textAlign: 'center' as const } as const;