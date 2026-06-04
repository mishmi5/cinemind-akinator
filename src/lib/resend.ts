import { Resend } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder');

// Check if Resend is actually configured with a real key
export const isResendConfigured = 
  process.env.RESEND_API_KEY && 
  process.env.RESEND_API_KEY !== 're_placeholder';
