import type { Env } from '@nepse/config';
import type { Notification, NotificationChannel, PrismaClient } from '@nepse/database';
import nodemailer, { type Transporter } from 'nodemailer';
import { logger } from './logger';

/** Delivery adapter per channel. Add Telegram/SMS/Push by implementing this interface. */
export interface NotificationAdapter {
  channel: NotificationChannel;
  send(n: Notification, recipient: { email: string; name: string | null }): Promise<void>;
}

export class InAppAdapter implements NotificationAdapter {
  channel = 'IN_APP' as const;
  async send(): Promise<void> {
    /* Stored in the notifications table; the UI polls for it. */
  }
}

export class EmailAdapter implements NotificationAdapter {
  channel = 'EMAIL' as const;
  private readonly transport: Transporter;
  constructor(private readonly env: Env) {
    this.transport = env.SMTP_HOST
      ? nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined })
      : nodemailer.createTransport({ jsonTransport: true });
  }
  async send(n: Notification, to: { email: string }): Promise<void> {
    const info = await this.transport.sendMail({
      from: this.env.SMTP_FROM, to: to.email, subject: n.title,
      text: `${n.body}\n\n—\nResearch alert only. Not financial advice; signals do not guarantee future performance.`,
    });
    if (!this.env.SMTP_HOST) logger.info({ notificationId: n.id, preview: String(info.message ?? '').slice(0, 200) }, 'SMTP not configured — email rendered to log only');
  }
}

class NotConfiguredAdapter implements NotificationAdapter {
  constructor(public channel: NotificationChannel) {}
  async send(): Promise<void> {
    throw new Error(`${this.channel} notifications are not configured yet`);
  }
}

export class NotificationService {
  private readonly adapters: Map<NotificationChannel, NotificationAdapter>;
  constructor(private readonly db: PrismaClient, env: Env) {
    const list: NotificationAdapter[] = [new InAppAdapter(), new EmailAdapter(env), new NotConfiguredAdapter('TELEGRAM'), new NotConfiguredAdapter('SMS'), new NotConfiguredAdapter('PUSH')];
    this.adapters = new Map(list.map((a) => [a.channel, a]));
  }

  async deliver(notificationId: string): Promise<void> {
    const n = await this.db.notification.findUnique({ where: { id: notificationId }, include: { user: true } });
    if (!n || n.status === 'SENT') return;
    try {
      await this.adapters.get(n.channel)!.send(n, { email: n.user.email, name: n.user.name });
      await this.db.notification.update({ where: { id: n.id }, data: { status: 'SENT', sentAt: new Date(), error: null } });
    } catch (e) {
      await this.db.notification.update({ where: { id: n.id }, data: { status: 'FAILED', error: (e as Error).message } });
      throw e;
    }
  }
}
