import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export function getAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // Critical for getting a refresh token
    scope: SCOPES,
    prompt: 'consent', // Ensures we always get a refresh token
  });
}

export async function getTokens(code) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/**
 * Sends an email using a saved refresh token
 */
export async function sendGmailEmail(refreshToken, { to, subject, body }) {
  console.log(`[Gmail API] Attempting to send email to: ${to} | Subject: ${subject}`);
  
  oauth2Client.setCredentials({
    refresh_token: refreshToken
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const messageParts = [
    `To: ${to}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    `Subject: ${utf8Subject}`,
    '',
    body,
  ];
  const message = messageParts.join('\n');

  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    console.log(`[Gmail API] Success! Message ID: ${res.data.id}`);
    return res.data;
  } catch (error) {
    console.error(`[Gmail API] Failed to send email:`, error.response?.data || error.message);
    throw error;
  }
}

