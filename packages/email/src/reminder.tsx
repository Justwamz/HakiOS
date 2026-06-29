import { render } from '@react-email/components'
import {
  Html, Head, Body, Container, Heading, Text, Button, Hr, Row, Column, Section,
} from '@react-email/components'
import * as React from 'react'

export interface ReminderEmailProps {
  recipientName: string
  firmName: string
  matterName: string
  matterNumber: string
  eventType: string
  eventDate: string
  advocates: string[]
  courtName?: string
  courtFileNumber?: string
  eventUrl: string
  daysUntil: number
}

function ReminderEmail({
  recipientName, firmName, matterName, matterNumber, eventType,
  eventDate, advocates, courtName, courtFileNumber, eventUrl, daysUntil,
}: ReminderEmailProps) {
  const urgencyColor = daysUntil <= 1 ? '#c0392b' : daysUntil <= 7 ? '#d4820a' : '#1a6b9a'
  const urgencyLabel = daysUntil === 0 ? 'TODAY' : daysUntil === 1 ? 'TOMORROW' : `IN ${daysUntil} DAYS`

  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: '#f7f5f0', fontFamily: 'Inter, sans-serif' }}>
        <Container style={{ maxWidth: '560px', margin: '40px auto', backgroundColor: '#ffffff', borderRadius: '8px', padding: '40px' }}>
          <Section style={{ backgroundColor: urgencyColor, borderRadius: '4px', padding: '8px 16px', marginBottom: '24px' }}>
            <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: '13px', margin: 0 }}>
              {urgencyLabel} — {eventType.replace(/_/g, ' ').toUpperCase()}
            </Text>
          </Section>
          <Heading style={{ color: '#0a5c3e', fontSize: '22px' }}>{matterName}</Heading>
          <Text style={{ color: '#8a8a82', fontSize: '13px', marginTop: '-12px' }}>
            Matter {matterNumber}
          </Text>
          <Hr style={{ borderColor: '#e0ded8' }} />
          <Row>
            <Column><Text style={{ color: '#4a4a45', fontSize: '14px' }}><strong>Date:</strong> {eventDate}</Text></Column>
          </Row>
          {courtName && (
            <Row>
              <Column><Text style={{ color: '#4a4a45', fontSize: '14px' }}><strong>Court:</strong> {courtName}</Text></Column>
            </Row>
          )}
          {courtFileNumber && (
            <Row>
              <Column><Text style={{ color: '#4a4a45', fontSize: '14px' }}><strong>File no.:</strong> {courtFileNumber}</Text></Column>
            </Row>
          )}
          <Row>
            <Column>
              <Text style={{ color: '#4a4a45', fontSize: '14px' }}>
                <strong>Advocates:</strong> {advocates.join(', ')}
              </Text>
            </Column>
          </Row>
          <Section style={{ textAlign: 'center', margin: '24px 0' }}>
            <Button
              href={eventUrl}
              style={{ backgroundColor: '#0a5c3e', color: '#ffffff', padding: '12px 24px', borderRadius: '6px', fontSize: '15px' }}
            >
              View event in HakiOS
            </Button>
          </Section>
          <Hr style={{ borderColor: '#e0ded8' }} />
          <Text style={{ color: '#8a8a82', fontSize: '12px' }}>
            Sent by {firmName} via HakiOS Practice Management
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export async function renderReminderEmail(props: ReminderEmailProps): Promise<string> {
  return render(<ReminderEmail {...props} />)
}
