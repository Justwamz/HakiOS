import { render } from '@react-email/components'
import {
  Html, Head, Body, Container, Heading, Text, Button, Hr, Section,
} from '@react-email/components'
import * as React from 'react'

interface ResetEmailProps {
  firstName: string
  firmName: string
  resetUrl: string
}

function ResetEmail({ firstName, firmName, resetUrl }: ResetEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: '#f7f5f0', fontFamily: 'Inter, sans-serif' }}>
        <Container style={{ maxWidth: '560px', margin: '40px auto', backgroundColor: '#ffffff', borderRadius: '8px', padding: '40px' }}>
          <Heading style={{ color: '#0a5c3e', fontSize: '24px', marginBottom: '8px' }}>
            Password Reset — {firmName}
          </Heading>
          <Text style={{ color: '#1e1e1a' }}>Hi {firstName},</Text>
          <Text style={{ color: '#4a4a45' }}>
            We received a request to reset your password. Click the button below to choose a new one.
          </Text>
          <Section style={{ textAlign: 'center', margin: '32px 0' }}>
            <Button
              href={resetUrl}
              style={{ backgroundColor: '#0a5c3e', color: '#ffffff', padding: '12px 24px', borderRadius: '6px', fontSize: '16px' }}
            >
              Reset password
            </Button>
          </Section>
          <Hr style={{ borderColor: '#e0ded8' }} />
          <Text style={{ color: '#8a8a82', fontSize: '13px' }}>
            This link expires in 1 hour and can only be used once. If you did not request a password reset, ignore this email — your password has not changed.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export async function renderResetEmail(props: ResetEmailProps): Promise<string> {
  return render(<ResetEmail {...props} />)
}
