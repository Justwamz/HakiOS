import { render } from '@react-email/components'
import {
  Html, Head, Body, Container, Heading, Text, Button, Hr, Section,
} from '@react-email/components'
import * as React from 'react'

export interface EscalationEmailProps {
  partnerName: string
  firmName: string
  matterName: string
  matterNumber: string
  eventType: string
  eventDate: string
  advocateName: string
  hoursUnacknowledged: number
  eventUrl: string
}

function EscalationEmail({
  partnerName, firmName, matterName, matterNumber, eventType,
  eventDate, advocateName, hoursUnacknowledged, eventUrl,
}: EscalationEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: '#f7f5f0', fontFamily: 'Inter, sans-serif' }}>
        <Container style={{ maxWidth: '560px', margin: '40px auto', backgroundColor: '#ffffff', borderRadius: '8px', padding: '40px' }}>
          <Section style={{ backgroundColor: '#c0392b', borderRadius: '4px', padding: '8px 16px', marginBottom: '24px' }}>
            <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: '13px', margin: 0 }}>
              ESCALATION — UNACKNOWLEDGED EVENT
            </Text>
          </Section>
          <Heading style={{ color: '#0a5c3e', fontSize: '22px' }}>Action Required, {partnerName}</Heading>
          <Text style={{ color: '#4a4a45' }}>
            The following event has not been acknowledged by {advocateName} for {hoursUnacknowledged} hours.
          </Text>
          <Hr style={{ borderColor: '#e0ded8' }} />
          <Text style={{ color: '#4a4a45', fontSize: '14px' }}>
            <strong>Matter:</strong> {matterName} ({matterNumber})<br />
            <strong>Event:</strong> {eventType.replace(/_/g, ' ')}<br />
            <strong>Date:</strong> {eventDate}<br />
            <strong>Assigned to:</strong> {advocateName}
          </Text>
          <Section style={{ textAlign: 'center', margin: '24px 0' }}>
            <Button
              href={eventUrl}
              style={{ backgroundColor: '#c0392b', color: '#ffffff', padding: '12px 24px', borderRadius: '6px', fontSize: '15px' }}
            >
              Review event now
            </Button>
          </Section>
          <Hr style={{ borderColor: '#e0ded8' }} />
          <Text style={{ color: '#8a8a82', fontSize: '12px' }}>Sent by {firmName} via HakiOS</Text>
        </Container>
      </Body>
    </Html>
  )
}

export async function renderEscalationEmail(props: EscalationEmailProps): Promise<string> {
  return render(<EscalationEmail {...props} />)
}
