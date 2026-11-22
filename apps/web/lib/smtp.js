import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SYSTEM_EMAIL_HOST,
  port: parseInt(process.env.SYSTEM_EMAIL_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SYSTEM_EMAIL_USER,
    pass: process.env.SYSTEM_EMAIL_PASS,
  },
});

/**
 * Sends an email using SMTP (System Fallback)
 */
export async function sendSMTPEmail({ to, subject, body, fromName = 'workBYLiNE Team' }) {
  // Fail-Closed Dry-Run Safety Guard (RC-C1.2 Condition 5)
  if (process.env.CAREERTWIN_DRY_RUN_EMAIL !== 'false') {
    console.log(`[SMTP] Dry run active: external email to ${to} suppressed for safety.`);
    return { messageId: 'dry-run-suppressed', dryRun: true };
  }
  console.log(`[SMTP] Attempting to send email to: ${to} | Subject: ${subject}`);
  
  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${process.env.SYSTEM_EMAIL_USER}>`,
      to,
      subject,
      html: body,
    });

    console.log(`[SMTP] Success! Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`[SMTP] Failed to send email:`, error);
    throw error;
  }
}

