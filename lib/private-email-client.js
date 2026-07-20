const APPROVED_BUSINESS_MAILBOX = "advisory@stratasaudi.com";

function sanitize(value, maxLength) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength || 4000);
}

function sanitizeBoolean(value, defaultValue = true) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return value === true || value === "true";
}

function assertApprovedBusinessMailbox(value, label) {
  const normalized = sanitize(value, 255).toLowerCase();
  if (!normalized) {
    throw new Error(`${label} is not configured.`);
  }
  if (normalized !== APPROVED_BUSINESS_MAILBOX) {
    throw new Error(
      `${label} must use the approved Strata business mailbox ${APPROVED_BUSINESS_MAILBOX}.`,
    );
  }
  return normalized;
}

function mailboxConfig() {
  const user =
    sanitize(process.env.PRIVATE_EMAIL_IMAP_USER, 255) ||
    sanitize(process.env.PRIVATE_EMAIL_SMTP_USER, 255) ||
    sanitize(process.env.SMTP_USER, 255) ||
    sanitize(process.env.CONTACT_EMAIL, 255);
  const pass =
    sanitize(process.env.PRIVATE_EMAIL_IMAP_PASS, 255) ||
    sanitize(process.env.PRIVATE_EMAIL_SMTP_PASS, 255) ||
    sanitize(process.env.SMTP_PASS, 255);

  const mailbox = assertApprovedBusinessMailbox(
    sanitize(process.env.CONTACT_EMAIL, 255) || user || APPROVED_BUSINESS_MAILBOX,
    "CONTACT_EMAIL",
  );
  const imapUser = assertApprovedBusinessMailbox(user || mailbox, "PRIVATE_EMAIL_IMAP_USER");
  const smtpUser = assertApprovedBusinessMailbox(
    sanitize(process.env.PRIVATE_EMAIL_SMTP_USER, 255) ||
      sanitize(process.env.SMTP_USER, 255) ||
      imapUser,
    "PRIVATE_EMAIL_SMTP_USER",
  );

  return {
    mailbox,
    imap: {
      host: sanitize(process.env.PRIVATE_EMAIL_IMAP_HOST, 255) || "mail.privateemail.com",
      port: Number(sanitize(process.env.PRIVATE_EMAIL_IMAP_PORT, 8) || 993),
      secure: sanitizeBoolean(process.env.PRIVATE_EMAIL_IMAP_SECURE, true),
      auth: {
        user: imapUser,
        pass,
      },
    },
    smtp: {
      host:
        sanitize(process.env.PRIVATE_EMAIL_SMTP_HOST, 255) ||
        sanitize(process.env.SMTP_HOST, 255) ||
        "mail.privateemail.com",
      port: Number(
        sanitize(process.env.PRIVATE_EMAIL_SMTP_PORT, 8) ||
          sanitize(process.env.SMTP_PORT, 8) ||
          465,
      ),
      secure: sanitizeBoolean(
        process.env.PRIVATE_EMAIL_SMTP_SECURE ?? process.env.SMTP_SECURE,
        true,
      ),
      auth: {
        user: smtpUser,
        pass:
          sanitize(process.env.PRIVATE_EMAIL_SMTP_PASS, 255) ||
          sanitize(process.env.SMTP_PASS, 255) ||
          pass,
      },
    },
  };
}

function assertConfig(config) {
  if (!config.imap.auth.user || !config.imap.auth.pass) {
    throw new Error("Private Email IMAP credentials are not configured.");
  }
  if (!config.smtp.auth.user || !config.smtp.auth.pass) {
    throw new Error("Private Email SMTP credentials are not configured.");
  }
}

async function checkMailboxHealth() {
  const { ImapFlow } = require("imapflow");
  const config = mailboxConfig();
  assertConfig(config);

  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: config.imap.auth,
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const status = await client.status("INBOX", { messages: true, unseen: true, uidNext: true });
      let latest = null;
      for await (const message of client.fetch("1:*", { envelope: true, internalDate: true }, { uid: true })) {
        latest = message;
      }

      return {
        ok: true,
        mailbox: config.mailbox,
        imapHost: config.imap.host,
        inbox: {
          messages: status.messages || 0,
          unseen: status.unseen || 0,
          uidNext: status.uidNext || null,
        },
        latestMessage: latest
          ? {
              uid: latest.uid,
              subject: latest.envelope?.subject || "",
              from:
                latest.envelope?.from?.map((entry) => entry.address).filter(Boolean) || [],
              date: latest.internalDate ? new Date(latest.internalDate).toISOString() : null,
            }
          : null,
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

module.exports = {
  APPROVED_BUSINESS_MAILBOX,
  mailboxConfig,
  checkMailboxHealth,
};
