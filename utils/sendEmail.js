import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const sendEmail = async (options) => {
  const { email, subject, message, html } = options;

  // Validate required env vars
  if (
    !process.env.SMTP_USER || 
    !process.env.GOOGLE_OAUTH_CLIENT_ID || 
    !process.env.GOOGLE_OAUTH_CLIENT_SECRET || 
    !process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  ) {
    console.log('--- EMAIL MOCK (OAuth2 not fully configured) ---');
    console.log(`To: ${email}`);
    console.log(`Subject: ${subject}`);
    console.log(`Message: ${message}`);
    if (html) console.log(`HTML: ${html}`);
    console.log('------------------------------------------');
    return;
  }

  try {
    const OAuth2 = google.auth.OAuth2;
    const oauth2Client = new OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      "https://developers.google.com/oauthplayground" // Redirect URL
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN
    });

    const accessToken = await new Promise((resolve, reject) => {
      oauth2Client.getAccessToken((err, token) => {
        if (err) {
          reject('Failed to create access token: ' + err);
        }
        resolve(token);
      });
    });

    // Create transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: process.env.SMTP_USER,
        accessToken,
        clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
        clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
        refreshToken: process.env.GOOGLE_OAUTH_REFRESH_TOKEN
      },
    });

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'MediAI'}" <${process.env.SMTP_USER}>`,
      to: email,
      subject,
      text: message,
      ...(html && { html }),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent via Nodemailer OAuth2: %s', info.messageId);
  } catch (err) {
    console.error('Failed to send email with Nodemailer OAuth2:', err);
    throw err;
  }
};

export default sendEmail;
