"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { getApps, initializeApp } = require("firebase-admin/app");
const {
  FieldPath,
  getFirestore,
  Timestamp,
} = require("firebase-admin/firestore");

if (getApps().length === 0) {
  initializeApp();
}

function getArgument(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : null;
}

function timestampMillis(value) {
  return value instanceof Timestamp ? value.toMillis() : 0;
}

function resolvePostCreatedAt(postDocument) {
  const storedCreatedAt = postDocument.get("createdAt");

  if (storedCreatedAt instanceof Timestamp) {
    return {
      timestamp: storedCreatedAt,
      usedCreateTime: false,
    };
  }

  if (postDocument.createTime instanceof Timestamp) {
    return {
      timestamp: postDocument.createTime,
      usedCreateTime: true,
    };
  }

  throw new Error("La publicación no tiene createdAt ni createTime válido.");
}

function selectLastActivityTimestamp(postCreatedAt, latestReplyTimestamp) {
  if (!(postCreatedAt instanceof Timestamp)) {
    throw new Error("No existe un timestamp base válido para lastActivityAt.");
  }

  return (
    latestReplyTimestamp instanceof Timestamp &&
    latestReplyTimestamp.toMillis() > postCreatedAt.toMillis()
  ) ? latestReplyTimestamp : postCreatedAt;
}

async function getLatestReplyTimestamp(db, postId) {
  const snapshot = await db
    .collection("communityReplies")
    .where("postId", "==", postId)
    .get();
  let latest = null;

  for (const document of snapshot.docs) {
    const createdAt = document.get("createdAt");
    if (
      createdAt instanceof Timestamp &&
      (!latest || createdAt.toMillis() > latest.toMillis())
    ) {
      latest = createdAt;
    }
  }

  return {
    timestamp: latest,
    repliesRead: snapshot.size,
  };
}

async function run() {
  if (process.argv.includes("--help")) {
    console.log([
      "Uso:",
      "  npm run community:migrate:last-activity -- --dry-run",
      "  npm run community:migrate:last-activity -- --apply",
      "",
      "Opciones:",
      "  --apply             Escribe los cambios. Sin esta opción sólo simula.",
      "  --page-size=N       Publicaciones por lote (1-400, default 200).",
      "  --report=RUTA       Guarda el resultado completo como JSON.",
    ].join("\n"));
    return;
  }

  const apply = process.argv.includes("--apply");
  const pageSize = Math.min(
    400,
    Math.max(1, Number(getArgument("page-size")) || 200)
  );
  const reportPath = getArgument("report");
  const db = getFirestore();
  const result = {
    mode: apply ? "apply" : "dry-run",
    startedAt: new Date().toISOString(),
    postsRead: 0,
    repliesRead: 0,
    postsNeedingUpdate: 0,
    postsUpdated: 0,
    postsWithoutCreatedAt: 0,
    postsUsingCreateTime: 0,
    unchangedPosts: 0,
    errors: [],
  };
  const plannedUpdates = [];
  let cursor = null;
  let fatalError = false;

  console.log(JSON.stringify({
    event: "community-last-activity-migration-started",
    mode: result.mode,
    pageSize,
  }));

  while (true) {
    let postsQuery = db
      .collection("communityPosts")
      .orderBy(FieldPath.documentId())
      .limit(pageSize);

    if (cursor) {
      postsQuery = postsQuery.startAfter(cursor);
    }

    const postsSnapshot = await postsQuery.get();
    if (postsSnapshot.empty) break;

    for (const postDocument of postsSnapshot.docs) {
      result.postsRead += 1;

      try {
        const storedCreatedAt = postDocument.get("createdAt");
        const resolvedCreatedAt = resolvePostCreatedAt(postDocument);
        const postCreatedAt = resolvedCreatedAt.timestamp;

        if (!(storedCreatedAt instanceof Timestamp)) {
          result.postsWithoutCreatedAt += 1;
        }

        if (resolvedCreatedAt.usedCreateTime) {
          result.postsUsingCreateTime += 1;
        }

        const replies = await getLatestReplyTimestamp(db, postDocument.id);
        result.repliesRead += replies.repliesRead;
        const desiredTimestamp = selectLastActivityTimestamp(
          postCreatedAt,
          replies.timestamp
        );
        const currentTimestamp = postDocument.get("lastActivityAt");

        if (timestampMillis(currentTimestamp) === desiredTimestamp.toMillis()) {
          result.unchangedPosts += 1;
          continue;
        }

        result.postsNeedingUpdate += 1;

        plannedUpdates.push({
          ref: postDocument.ref,
          lastActivityAt: desiredTimestamp,
        });
      } catch (error) {
        result.errors.push({
          postId: postDocument.id,
          message: error?.message || String(error),
        });
        fatalError = true;
        break;
      }
    }

    if (fatalError) break;

    cursor = postsSnapshot.docs[postsSnapshot.docs.length - 1];
    console.log(JSON.stringify({
      event: "community-last-activity-migration-progress",
      postsRead: result.postsRead,
      repliesRead: result.repliesRead,
      postsNeedingUpdate: result.postsNeedingUpdate,
      postsUpdated: result.postsUpdated,
      errors: result.errors.length,
    }));
  }

  if (apply && !fatalError) {
    for (let index = 0; index < plannedUpdates.length; index += 400) {
      const updateBatch = plannedUpdates.slice(index, index + 400);
      const writeBatch = db.batch();

      for (const update of updateBatch) {
        writeBatch.update(update.ref, {
          lastActivityAt: update.lastActivityAt,
        });
      }

      await writeBatch.commit();
      result.postsUpdated += updateBatch.length;
    }
  }

  if (apply && !fatalError) {
    const verificationSnapshot = await db.collection("communityPosts").get();
    const invalidPost = verificationSnapshot.docs.find(
      (document) => !(document.get("lastActivityAt") instanceof Timestamp)
    );

    if (invalidPost) {
      result.errors.push({
        postId: invalidPost.id,
        message: "La verificación final encontró lastActivityAt nulo o inválido.",
      });
      fatalError = true;
    }
  }

  result.finishedAt = new Date().toISOString();

  if (reportPath) {
    const absoluteReportPath = path.resolve(reportPath);
    fs.mkdirSync(path.dirname(absoluteReportPath), { recursive: true });
    fs.writeFileSync(
      absoluteReportPath,
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8"
    );
    result.reportPath = absoluteReportPath;
  }

  console.log(JSON.stringify({
    event: "community-last-activity-migration-finished",
    ...result,
  }, null, 2));

  if (fatalError || result.errors.length > 0) {
    process.exitCode = 1;
  }
}

module.exports = {
  resolvePostCreatedAt,
  selectLastActivityTimestamp,
};

if (require.main === module) {
  run().catch((error) => {
    console.error(JSON.stringify({
      event: "community-last-activity-migration-failed",
      message: error?.message || String(error),
      stack: error?.stack || null,
    }, null, 2));
    process.exitCode = 1;
  });
}
