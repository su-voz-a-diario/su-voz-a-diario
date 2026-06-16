"use strict";

const { getApps, initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { logger } = require("firebase-functions");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const {
  getRemoteBibleBooks,
  getRemoteBibleChapter,
  searchRemoteBible,
} = require("./bibleProxy");

if (getApps().length === 0) {
  initializeApp();
}

const DAILY_SCHEDULE = "*/5 * * * *";
const TIME_ZONE = "America/Mexico_City";
const MAX_MULTICAST_TOKENS = 500;
const MAX_FIRESTORE_BATCH_WRITES = 500;
const MAX_FIRESTORE_IN_VALUES = 30;
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

async function incrementUserActivity(db, uid) {
  if (typeof uid !== "string" || uid.length === 0) {
    return null;
  }

  const activityRef = db.collection("userActivity").doc(uid);
  return db.runTransaction(async (transaction) => {
    const activitySnapshot = await transaction.get(activityRef);

    if (!activitySnapshot.exists) {
      return null;
    }

    const currentCount = activitySnapshot.get("unreadCommunityCount");
    const badgeCount = Number.isInteger(currentCount) && currentCount >= 0
      ? currentCount + 1
      : 1;

    transaction.update(activityRef, {
      unreadCommunityCount: badgeCount,
    });

    return { uid, badgeCount };
  });
}

async function incrementCommunityForAllUsers(db, actorUid) {
  const snapshot = await db.collection("userActivity").get();
  const recipientDocuments = snapshot.docs.filter(
    (document) => document.id !== actorUid
  );
  const updates = [];

  for (const documentsBatch of chunk(
    recipientDocuments,
    MAX_FIRESTORE_BATCH_WRITES
  )) {
    const writeBatch = db.batch();

    for (const document of documentsBatch) {
      writeBatch.update(document.ref, {
        unreadCommunityCount: FieldValue.increment(1),
      });
    }

    await writeBatch.commit();

    const updatedSnapshots = await db.getAll(
      ...documentsBatch.map((document) => document.ref)
    );

    for (const activitySnapshot of updatedSnapshots) {
      const badgeCount = activitySnapshot.get("unreadCommunityCount");

      if (Number.isInteger(badgeCount) && badgeCount > 0) {
        updates.push({
          uid: activitySnapshot.id,
          badgeCount,
        });
      }
    }
  }

  return updates;
}

async function getCommunityPostOwner(db, postId) {
  if (typeof postId !== "string" || postId.length === 0) {
    return null;
  }

  const postSnapshot = await db.collection("communityPosts").doc(postId).get();
  return postSnapshot.exists ? postSnapshot.get("ownerUid") : null;
}

async function getActiveRecipientsByUid(db, uids) {
  const recipientsByUid = new Map();
  const uniqueUids = [...new Set(uids.filter(Boolean))];

  for (const uidBatch of chunk(uniqueUids, MAX_FIRESTORE_IN_VALUES)) {
    const snapshot = await db
      .collection("pushTokens")
      .where("uid", "in", uidBatch)
      .get();

    for (const document of snapshot.docs) {
      if (document.get("notificationsEnabled") !== true) {
        continue;
      }

      const uid = document.get("uid");
      const documents = recipientsByUid.get(uid) || [];
      documents.push(document);
      recipientsByUid.set(uid, documents);
    }
  }

  return recipientsByUid;
}

async function sendCommunityBadgeUpdates(db, updates) {
  if (!updates.length) {
    return {
      usersWithActivity: 0,
      usersWithTokens: 0,
      successCount: 0,
      failureCount: 0,
      invalidTokensDeleted: 0,
    };
  }

  const recipientsByUid = await getActiveRecipientsByUid(
    db,
    updates.map(({ uid }) => uid)
  );
  const updatesByBadgeCount = new Map();

  for (const update of updates) {
    const documents = recipientsByUid.get(update.uid);

    if (!documents?.length) {
      continue;
    }

    const recipients = getRecipients(documents);
    const groupedRecipients = updatesByBadgeCount.get(update.badgeCount) || [];
    groupedRecipients.push(...recipients);
    updatesByBadgeCount.set(update.badgeCount, groupedRecipients);
  }

  const totals = {
    usersWithActivity: updates.length,
    usersWithTokens: [...recipientsByUid.keys()].length,
    successCount: 0,
    failureCount: 0,
    invalidTokensDeleted: 0,
  };

  for (const [badgeCount, recipients] of updatesByBadgeCount.entries()) {
    const result = await sendNotification(db, recipients, {
      type: "community-badge",
      badgeCount: String(badgeCount),
      title: "Su Voz a Diario",
      body: "Hay nueva actividad en Comunidad.",
      url: "https://suvoz.app/#community",
      tag: "community-activity",
    });

    totals.successCount += result.successCount;
    totals.failureCount += result.failureCount;
    totals.invalidTokensDeleted += result.invalidTokensDeleted;
  }

  return totals;
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
      notification: {
        title: data.title || "Su Voz a Diario",
        body: data.body || "Tienes una nueva notificación.",
      },
      data,
      android: {
        priority: "high",
        notification: {
          channelId: "default",
          sound: "default",
          tag: data.tag || "su-voz-notification",
          clickAction: "OPEN_APP",
        },
      },
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

exports.countNewCommunityPost = onDocumentCreated(
  {
    document: "communityPosts/{postId}",
    region: "us-central1",
  },
  async (event) => {
    const post = event.data?.data();
    const db = getFirestore();
    const updates = await incrementCommunityForAllUsers(
      db,
      post?.ownerUid
    );
    const pushResult = await sendCommunityBadgeUpdates(db, updates);

    logger.info("Actividad de publicación contabilizada.", {
      postId: event.params.postId,
      actorUid: post?.ownerUid || null,
      updatedUsers: updates.length,
      ...pushResult,
    });
  }
);

exports.countNewCommunityReply = onDocumentCreated(
  {
    document: "communityReplies/{replyId}",
    region: "us-central1",
  },
  async (event) => {
    const reply = event.data?.data();
    const db = getFirestore();
    const postOwnerUid = await getCommunityPostOwner(db, reply?.postId);
    const update = postOwnerUid !== reply?.ownerUid
      ? await incrementUserActivity(db, postOwnerUid)
      : null;
    const pushResult = await sendCommunityBadgeUpdates(
      db,
      update ? [update] : []
    );

    logger.info("Actividad de respuesta contabilizada.", {
      replyId: event.params.replyId,
      postId: reply?.postId || null,
      actorUid: reply?.ownerUid || null,
      recipientUid: postOwnerUid,
      badgeCount: update?.badgeCount || 0,
      ...pushResult,
    });
  }
);

exports.countNewCommunityReaction = onDocumentCreated(
  {
    document: "communityReactions/{reactionId}",
    region: "us-central1",
  },
  async (event) => {
    const reaction = event.data?.data();
    const db = getFirestore();
    const postOwnerUid = await getCommunityPostOwner(db, reaction?.postId);
    const update = postOwnerUid !== reaction?.userId
      ? await incrementUserActivity(db, postOwnerUid)
      : null;
    const pushResult = await sendCommunityBadgeUpdates(
      db,
      update ? [update] : []
    );

    logger.info("Actividad de reacción contabilizada.", {
      reactionId: event.params.reactionId,
      postId: reaction?.postId || null,
      actorUid: reaction?.userId || null,
      recipientUid: postOwnerUid,
      badgeCount: update?.badgeCount || 0,
      ...pushResult,
    });
  }
);

exports.getRemoteBibleBooks = getRemoteBibleBooks;
exports.getRemoteBibleChapter = getRemoteBibleChapter;
exports.searchRemoteBible = searchRemoteBible;
