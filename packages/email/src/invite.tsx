import { render } from '@react-email/components'
import {
  Html, Head, Body, Container, Heading, Text, Button, Hr, Section,
} from '@react-email/components'
import * as React from 'react'

interface InviteEmailProps {
  firstName: string
  firmName: string
  setupUrl: string
  expiresInHours: number
}

function InviteEmail({ firstName, firmName, setupUrl, expiresInHours }: InviteEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: '#f7f5f0', fontFamily: 'Inter, sans-serif' }}>
        <Container style={{ maxWidth: '560px', margin: '40px auto', backgroundColor: '#ffffff', borderRadius: '8px', padding: '40px' }}>
          <Heading style={{ color: '#0a5c3e', fontSize: '24px', marginBottom: '8px' }}>
            Welcome to {firmName}
          </Heading>
          <Text style={{ color: '#1e1e1a', fontSize: '16px' }}>
            Hi {firstName},
          </Text>
          <Text style={{ color: '#4a4a45', fontSize: '16px' }}>
            You have been added to HakiOS. Click the button below to set your password and access the system.
          </Text>
          <Section style={{ textAlign: 'center', margin: '32px 0' }}>
            <Button
              href={setupUrl}
              style={{ backgroundColor: '#0a5c3e', color: '#ffffff', padding: '12px 24px', borderRadius: '6px', fontSize: '16px', fontWeight: '500' }}
            >
              Set up your account
            </Button>
          </Section>
          <Hr style={{ borderColor: '#e0ded8' }} />
          <Text style={{ color: '#8a8a82', fontSize: '13px' }}>
            This link expires in {expiresInHours} hours and can only be used once. If you did not expect this invitation, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export async function renderInviteEmail(props: InviteEmailProps): Promise<string> {
  return render(<InviteEmail {...props} />)
}
