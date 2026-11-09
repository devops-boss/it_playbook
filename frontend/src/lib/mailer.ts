import net from 'net';
import tls from 'tls';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<{ success: boolean; message: string }> {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER || 'itsupport@bigoutsource.net';
  const pass = process.env.SMTP_PASS || 'ihfshjedhvlbseuc';
  const senderName = process.env.SMTP_SENDER_NAME || 'IT Operations Playbook';

  return new Promise((resolve, reject) => {
    const socket = net.createConnection(port, host, () => {
      let state = 'INIT';
      let secureSocket: tls.TLSSocket | null = null;

      function handleResponse(data: Buffer, activeSocket: net.Socket | tls.TLSSocket) {
        const res = data.toString();

        if (state === 'INIT' && res.startsWith('220')) {
          state = 'EHLO1';
          activeSocket.write('EHLO localhost\r\n');
        } else if (state === 'EHLO1' && res.startsWith('250')) {
          if (res.includes('STARTTLS')) {
            state = 'STARTTLS';
            activeSocket.write('STARTTLS\r\n');
          } else {
            // No STARTTLS, proceed to AUTH directly
            state = 'AUTH';
            const authStr = Buffer.from(`\0${user}\0${pass}`).toString('base64');
            activeSocket.write(`AUTH PLAIN ${authStr}\r\n`);
          }
        } else if (state === 'STARTTLS' && res.startsWith('220')) {
          state = 'TLS_HANDSHAKE';
          secureSocket = tls.connect({ socket: activeSocket as net.Socket, servername: host }, () => {
            state = 'EHLO2';
            secureSocket!.write('EHLO localhost\r\n');
          });
          secureSocket.on('data', (d) => handleResponse(d, secureSocket!));
          secureSocket.on('error', (err) => reject(err));
        } else if (state === 'EHLO2' && res.startsWith('250')) {
          state = 'AUTH';
          const authStr = Buffer.from(`\0${user}\0${pass}`).toString('base64');
          secureSocket!.write(`AUTH PLAIN ${authStr}\r\n`);
        } else if (state === 'AUTH' && res.startsWith('235')) {
          state = 'MAIL_FROM';
          (secureSocket || activeSocket).write(`MAIL FROM:<${user}>\r\n`);
        } else if (state === 'MAIL_FROM' && res.startsWith('250')) {
          state = 'RCPT_TO';
          (secureSocket || activeSocket).write(`RCPT TO:<${to}>\r\n`);
        } else if (state === 'RCPT_TO' && res.startsWith('250')) {
          state = 'DATA';
          (secureSocket || activeSocket).write('DATA\r\n');
        } else if (state === 'DATA' && res.startsWith('354')) {
          state = 'BODY';
          const emailData = [
            `From: "${senderName}" <${user}>`,
            `To: <${to}>`,
            `Subject: ${subject}`,
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=utf-8',
            '',
            html,
            '\r\n.',
            '',
          ].join('\r\n');
          (secureSocket || activeSocket).write(emailData);
        } else if (state === 'BODY' && res.startsWith('250')) {
          state = 'QUIT';
          (secureSocket || activeSocket).write('QUIT\r\n');
          resolve({ success: true, message: 'Email sent successfully via SMTP.' });
        } else if (res.startsWith('4') || res.startsWith('5')) {
          reject(new Error(`SMTP Error: ${res.trim()}`));
        }
      }

      socket.on('data', (d) => handleResponse(d, socket));
      socket.on('error', (err) => reject(err));
    });

    socket.setTimeout(15000, () => {
      socket.destroy();
      reject(new Error('SMTP connection timed out.'));
    });
  });
}

export async function sendOtpEmail(recipientEmail: string, otpCode: string): Promise<boolean> {
  const subject = `Your IT Operations Playbook Login Code: ${otpCode}`;
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
          .container { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .header { background: #233B74; padding: 24px; text-align: center; }
          .header h1 { color: #ffffff; font-size: 20px; margin: 0; font-weight: 700; letter-spacing: -0.025em; }
          .header p { color: #93c5fd; font-size: 13px; margin: 4px 0 0 0; }
          .content { padding: 32px 24px; }
          .greeting { font-size: 15px; font-weight: 600; color: #0f172a; margin-bottom: 8px; }
          .message { font-size: 14px; color: #475569; line-height: 1.5; margin-bottom: 24px; }
          .code-box { background: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 18px; text-align: center; margin: 20px 0; }
          .code { font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #233B74; }
          .expiry { font-size: 12px; color: #64748b; margin-top: 8px; }
          .warning { font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 16px; margin-top: 24px; }
          .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; font-size: 11px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>IT Operations Playbook</h1>
            <p>Big Outsource Authentication Service</p>
          </div>
          <div class="content">
            <div class="greeting">Hello,</div>
            <div class="message">
              You requested a secure One-Time PIN (OTP) to sign into the Big Outsource IT Operations Playbook. Use the verification code below to access your dashboard:
            </div>
            <div class="code-box">
              <div class="code">${otpCode}</div>
              <div class="expiry">This code will expire in 10 minutes.</div>
            </div>
            <div class="warning">
              If you did not request this login code, you can safely ignore this email. Do not share this code with anyone.
            </div>
          </div>
          <div class="footer">
            Big Outsource &bull; Internal Operations System &bull; itsupport@bigoutsource.net
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: recipientEmail,
    subject,
    html,
  });

  return true;
}
