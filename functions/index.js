"use strict";

const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { logger } = require("firebase-functions");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");

if (getApps().length === 0) {
  initializeApp();
}

const DAILY_SCHEDULE = "*/5 * * * *";
const TIME_ZONE = "America/Mexico_City";
const MAX_MULTICAST_TOKENS = 500;
const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function getCurrentReminderTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = parts.find(({ type }) => type === "hour")?.value;
  const minute = parts.find(({ type }) => type === "minute")?.value;

  if (!hour || !minute) {
    throw new Error(`No se pudo calcular la hora actual en ${TIME_ZONE}.`);
  }

  return `${hour}:${minute}`;
}

async function deleteInvalidTokens(db, documents) {
  const batches = chunk(documents, MAX_MULTICAST_TOKENS);

  for (const documentsBatch of batches) {
    const writeBatch = db.batch();

    for (const document of documentsBatch) {
      writeBatch.delete(document.ref);
    }

    await writeBatch.commit();
  }
}

function getRecipients(documents) {
  const recipientsByToken = new Map();

  for (const document of documents) {
    const token = document.get("token");

    if (typeof token !== "string" || token.length === 0) {
      continue;
    }

    const recipient = recipientsByToken.get(token);

    if (recipient) {
      recipient.documents.push(document);
    } else {
      recipientsByToken.set(token, {
        token,
        documents: [document],
      });
    }
  }

  return [...recipientsByToken.values()];
}

async function sendNotification(db, recipients, data) {
  let successCount = 0;
  let failureCount = 0;
  const invalidDocuments = [];

  for (const recipientBatch of chunk(recipients, MAX_MULTICAST_TOKENS)) {
    const response = await getMessaging().sendEachForMulticast({
      tokens: recipientBatch.map(({ token }) => token),
      data,
      webpush: {
        fcmOptions: {
          link: data.url,
        },
      },
    });

    successCount += response.successCount;
    failureCount += response.failureCount;

    response.responses.forEach((result, index) => {
      const errorCode = result.error?.code;

      if (!result.success && INVALID_TOKEN_CODES.has(errorCode)) {
        invalidDocuments.push(...recipientBatch[index].documents);
      }
    });
  }

  if (invalidDocuments.length > 0) {
    await deleteInvalidTokens(db, invalidDocuments);
  }

  return {
    successCount,
    failureCount,
    invalidTokensDeleted: invalidDocuments.length,
  };
}

exports.sendTestNotification = onCall(
  {
    region: "us-central1",
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError(
        "unauthenticated",
        "Debes iniciar sesión para probar las notificaciones."
      );
    }

    const db = getFirestore();
    const snapshot = await db
      .collection("pushTokens")
      .where("uid", "==", request.auth.uid)
      .get();
    const activeDocuments = snapshot.docs.filter(
      (document) => document.get("notificationsEnabled") === true
    );
    const recipients = getRecipients(activeDocuments);

    if (recipients.length === 0) {
      throw new HttpsError(
        "failed-precondition",
        "No hay tokens activos para este usuario."
      );
    }

    const result = await sendNotification(db, recipients, {
      title: "Su Voz a Diario",
      body: "Las notificaciones están configuradas correctamente.",
      url: "https://suvoz.app/#home",
      tag: "notification-test",
    });

    logger.info("Notificación de prueba procesada.", {
      uid: request.auth.uid,
      recipients: recipients.length,
      ...result,
    });

    return result;
  }
);

exports.sendDailyNotification = onSchedule(
  {
    schedule: DAILY_SCHEDULE,
    timeZone: TIME_ZONE,
    region: "us-central1",
    retryCount: 0,
  },
  async () => {
    const db = getFirestore();
    const currentReminderTime = getCurrentReminderTime();
    const snapshot = await db
      .collection("pushTokens")
      .where("notificationsEnabled", "==", true)
      .where("reminderTime", "==", currentReminderTime)
      .get();

    const recipients = getRecipients(snapshot.docs);

    if (recipients.length === 0) {
      logger.info("No hay tokens para el recordatorio diario.", {
        currentReminderTime,
        tokensFound: 0,
        successCount: 0,
        failureCount: 0,
      });
      return;
    }

    const result = await sendNotification(db, recipients, {
      title: "Su Voz a Diario",
      body: "Es momento de escuchar Su voz hoy.",
      url: "https://suvoz.app/#home",
      tag: "daily-reminder",
    });

    logger.info("Recordatorio diario procesado.", {
      currentReminderTime,
      tokensFound: recipients.length,
      ...result,
    });
  }
);
