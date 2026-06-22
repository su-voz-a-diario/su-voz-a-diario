"use strict";

const { logger } = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const {
  YouVersionBibleClient,
} = require("./youVersionBibleClient");

const JEFFERSON_BIBLE_API_KEY = defineSecret("JEFFERSON_BIBLE_API_KEY");

const ALLOWED_VERSION_IDS = new Set(["nbla", "nvi", "biblia-libre"]);
const CALLABLE_OPTIONS = {
  region: "us-central1",
  timeoutSeconds: 15,
  memory: "256MiB",
  secrets: [JEFFERSON_BIBLE_API_KEY],
};
const UPSTREAM_TIMEOUT_MS = 8000;
const YOU_VERSION_VERSIONS = Object.freeze({
  nbla: Object.freeze({
    sourceId: "103",
    label: "NBLA",
    name: "Nueva Biblia de las Américas",
  }),
  nvi: Object.freeze({
    sourceId: "128",
    label: "NVI",
    name: "Nueva Versión Internacional",
  }),
  "biblia-libre": Object.freeze({
    sourceId: "3291",
    label: "VBL",
    name: "Biblia Libre",
  }),
});

class BibleProxyError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "BibleProxyError";
    this.code = code;
    this.details = details;
  }
}

function requireAuthenticatedUser(request) {
  if (!request.auth?.uid) {
    throw new BibleProxyError(
      "UNAUTHENTICATED",
      "Debes iniciar sesión para consultar Biblias remotas."
    );
  }
}

function requireObject(value, fieldName = "data") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BibleProxyError(
      "INVALID_ARGUMENT",
      `${fieldName} debe ser un objeto.`
    );
  }

  return value;
}

function requireString(value, fieldName, { min = 1, max = 100 } = {}) {
  if (typeof value !== "string") {
    throw new BibleProxyError(
      "INVALID_ARGUMENT",
      `${fieldName} debe ser texto.`
    );
  }

  const normalized = value.trim();

  if (normalized.length < min || normalized.length > max) {
    throw new BibleProxyError(
      "INVALID_ARGUMENT",
      `${fieldName} debe tener entre ${min} y ${max} caracteres.`
    );
  }

  return normalized;
}

function requireInteger(
  value,
  fieldName,
  { min = 1, max = Number.MAX_SAFE_INTEGER, defaultValue } = {}
) {
  const candidate = value === undefined ? defaultValue : value;

  if (!Number.isInteger(candidate) || candidate < min || candidate > max) {
    throw new BibleProxyError(
      "INVALID_ARGUMENT",
      `${fieldName} debe ser un entero entre ${min} y ${max}.`
    );
  }

  return candidate;
}

function requireVersionId(value) {
  const versionId = requireString(value, "versionId", { max: 30 })
    .toLowerCase();

  if (!ALLOWED_VERSION_IDS.has(versionId)) {
    throw new BibleProxyError(
      "VERSION_NOT_ALLOWED",
      `La versión ${versionId} no está permitida.`
    );
  }

  return versionId;
}

function normalizeBookId(value) {
  return requireString(value, "bookId", { max: 50 }).toLowerCase();
}

function validateBook(book, versionId) {
  requireObject(book, "book");

  return {
    versionId,
    bookId: requireString(book.bookId, "book.bookId", { max: 50 })
      .toLowerCase(),
    bookName: requireString(book.bookName, "book.bookName", { max: 100 }),
    abbreviation: requireString(
      book.abbreviation,
      "book.abbreviation",
      { max: 20 }
    ),
    chapters: requireInteger(book.chapters, "book.chapters", {
      min: 1,
      max: 200,
    }),
  };
}

function validateVerse(verse, bookName, chapter) {
  requireObject(verse, "verse");
  const number = requireInteger(verse.number, "verse.number", {
    min: 1,
    max: 300,
  });

  return {
    number,
    text: requireString(verse.text, "verse.text", { max: 10000 }),
    reference: requireString(
      verse.reference || `${bookName} ${chapter}:${number}`,
      "verse.reference",
      { max: 150 }
    ),
  };
}

function validateChapter(chapterData, requested) {
  requireObject(chapterData, "chapter");
  const versionId = requireVersionId(chapterData.versionId);
  const bookId = normalizeBookId(chapterData.bookId);
  const chapter = requireInteger(chapterData.chapter, "chapter.chapter", {
    min: 1,
    max: 200,
  });

  if (
    versionId !== requested.versionId ||
    bookId !== requested.bookId ||
    chapter !== requested.chapter
  ) {
    throw new BibleProxyError(
      "INVALID_UPSTREAM_RESPONSE",
      "La respuesta no corresponde al capítulo solicitado."
    );
  }

  const bookName = requireString(
    chapterData.bookName,
    "chapter.bookName",
    { max: 100 }
  );

  if (!Array.isArray(chapterData.verses) || chapterData.verses.length === 0) {
    throw new BibleProxyError(
      "INVALID_UPSTREAM_RESPONSE",
      "La respuesta no contiene versículos válidos."
    );
  }

  return {
    versionId,
    versionLabel: requireString(
      chapterData.versionLabel,
      "chapter.versionLabel",
      { max: 30 }
    ),
    versionName: requireString(
      chapterData.versionName,
      "chapter.versionName",
      { max: 150 }
    ),
    bookId,
    bookName,
    chapter,
    verses: chapterData.verses.map((verse) =>
      validateVerse(verse, bookName, chapter)
    ),
  };
}

function validateSearchResult(result, versionId) {
  requireObject(result, "searchResult");
  const bookName = requireString(
    result.bookName,
    "searchResult.bookName",
    { max: 100 }
  );
  const chapter = requireInteger(
    result.chapter,
    "searchResult.chapter",
    { min: 1, max: 200 }
  );
  const verse = requireInteger(result.verse, "searchResult.verse", {
    min: 1,
    max: 300,
  });

  return {
    versionId,
    bookId: normalizeBookId(result.bookId),
    bookName,
    chapter,
    verse,
    text: requireString(result.text, "searchResult.text", { max: 10000 }),
    reference: requireString(
      result.reference || `${bookName} ${chapter}:${verse}`,
      "searchResult.reference",
      { max: 150 }
    ),
  };
}

function validateUpstreamResponse(operation) {
  try {
    return operation();
  } catch (error) {
    if (error?.code === "INVALID_UPSTREAM_RESPONSE") {
      throw error;
    }

    throw new BibleProxyError(
      "INVALID_UPSTREAM_RESPONSE",
      "La API bíblica devolvió una respuesta inválida."
    );
  }
}

async function withTimeout(operation, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  let timeoutId;

  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new BibleProxyError(
            "UPSTREAM_TIMEOUT",
            "La API bíblica tardó demasiado en responder."
          ));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function createUnconfiguredBibleClient() {
  const unavailable = async () => {
    // Fase siguiente: aquí se inyectará el cliente HTTP que leerá los
    // secrets y consultará exclusivamente la API de Jefferson/Jiberson.
    throw new BibleProxyError(
      "PROXY_NOT_CONFIGURED",
      "El proveedor bíblico remoto todavía no está conectado."
    );
  };

  return {
    getBooks: unavailable,
    getChapter: unavailable,
    search: unavailable,
  };
}

function createYouVersionProxyClient({
  createClient = (options) => new YouVersionBibleClient(options),
  getAppKey = () => JEFFERSON_BIBLE_API_KEY.value(),
} = {}) {
  function getVersion(versionId) {
    const version = YOU_VERSION_VERSIONS[versionId];

    if (!version) {
      throw new BibleProxyError(
        "VERSION_NOT_ALLOWED",
        `La versión ${versionId} no está configurada.`
      );
    }

    return version;
  }

  function getClient() {
    return createClient({
      appKey: String(getAppKey() || ""),
    });
  }

  return {
    async getBooks(versionId) {
      const version = getVersion(versionId);
      return getClient().getBooks({
        versionId: version.sourceId,
      });
    },

    async getChapter(versionId, bookId, chapter) {
      const version = getVersion(versionId);
      const sourceBookId = requireString(
        bookId,
        "bookId",
        { min: 2, max: 5 }
      ).toUpperCase();
      const result = await getClient().getChapterVerses({
        versionId: version.sourceId,
        bookUsfm: sourceBookId,
        chapter,
      });
      const passageBookName = String(result.passageReference || "")
        .replace(/\s+\d+(?::.*)?$/, "")
        .trim();

      return {
        versionId,
        versionLabel: version.label,
        versionName: version.name,
        bookId: sourceBookId.toLowerCase(),
        bookName: passageBookName || sourceBookId,
        chapter,
        verses: result.verses,
      };
    },

    async search() {
      throw new BibleProxyError(
        "SEARCH_NOT_SUPPORTED",
        "YouVersion Platform no ofrece búsqueda textual para esta integración."
      );
    },
  };
}

function createBibleProxyHandlers({
  client = createUnconfiguredBibleClient(),
  timeoutMs = UPSTREAM_TIMEOUT_MS,
} = {}) {
  return {
    async getBooks(request) {
      requireAuthenticatedUser(request);
      const data = requireObject(request.data);
      const versionId = requireVersionId(data.versionId);
      const books = await withTimeout(
        () => client.getBooks(versionId),
        timeoutMs
      );

      if (!Array.isArray(books)) {
        throw new BibleProxyError(
          "INVALID_UPSTREAM_RESPONSE",
          "La API bíblica devolvió una lista de libros inválida."
        );
      }

      return {
        versionId,
        books: validateUpstreamResponse(() =>
          books.map((book) => validateBook(book, versionId))
        ),
      };
    },

    async getChapter(request) {
      requireAuthenticatedUser(request);
      const data = requireObject(request.data);
      const params = {
        versionId: requireVersionId(data.versionId),
        bookId: normalizeBookId(data.bookId),
        chapter: requireInteger(data.chapter, "chapter", {
          min: 1,
          max: 200,
        }),
      };
      const chapterData = await withTimeout(
        () => client.getChapter(
          params.versionId,
          params.bookId,
          params.chapter
        ),
        timeoutMs
      );

      return validateUpstreamResponse(() =>
        validateChapter(chapterData, params)
      );
    },

    async search(request) {
      requireAuthenticatedUser(request);
      const data = requireObject(request.data);
      const params = {
        versionId: requireVersionId(data.versionId),
        query: requireString(data.query, "query", { min: 2, max: 100 }),
        limit: requireInteger(data.limit, "limit", {
          min: 1,
          max: 50,
          defaultValue: 20,
        }),
        page: requireInteger(data.page, "page", {
          min: 1,
          max: 10000,
          defaultValue: 1,
        }),
      };
      const response = await withTimeout(
        () => client.search(
          params.versionId,
          params.query,
          {
            limit: params.limit,
            page: params.page,
          }
        ),
        timeoutMs
      );

      return validateUpstreamResponse(() => {
        requireObject(response, "searchResponse");

        if (!Array.isArray(response.results)) {
          throw new BibleProxyError(
            "INVALID_UPSTREAM_RESPONSE",
            "La API bíblica devolvió resultados de búsqueda inválidos."
          );
        }

        return {
          ...params,
          total: requireInteger(response.total, "searchResponse.total", {
            min: 0,
          }),
          results: response.results.map((result) =>
            validateSearchResult(result, params.versionId)
          ),
        };
      });
    },
  };
}

function toHttpsError(error) {
  if (error instanceof HttpsError) {
    return error;
  }

  const codeByProxyCode = {
    UNAUTHENTICATED: "unauthenticated",
    INVALID_ARGUMENT: "invalid-argument",
    VERSION_NOT_ALLOWED: "permission-denied",
    PROXY_NOT_CONFIGURED: "failed-precondition",
    UPSTREAM_TIMEOUT: "deadline-exceeded",
    UPSTREAM_UNAVAILABLE: "unavailable",
    UPSTREAM_AUTH_FAILED: "permission-denied",
    UPSTREAM_RATE_LIMITED: "resource-exhausted",
    SEARCH_NOT_SUPPORTED: "unimplemented",
    NOT_FOUND: "not-found",
    INVALID_UPSTREAM_RESPONSE: "data-loss",
  };
  const callableCode = codeByProxyCode[error?.code] || "internal";
  const publicMessage = error instanceof BibleProxyError
    ? error.message
    : "No fue posible completar la consulta bíblica.";

  const details = {
    proxyCode: error?.code || "INTERNAL",
  };

  return new HttpsError(callableCode, publicMessage, details);
}

function createCallable(handler, options = CALLABLE_OPTIONS) {
  return onCall(options, async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      logger.warn("Consulta bíblica remota rechazada.", {
        callableCode: error?.code || "INTERNAL",
        uid: request.auth?.uid || null,
      });
      throw toHttpsError(error);
    }
  });
}

const handlers = createBibleProxyHandlers({
  client: createYouVersionProxyClient(),
});
const getRemoteBibleBooks = createCallable(handlers.getBooks);
const getRemoteBibleChapter = createCallable(handlers.getChapter);
const searchRemoteBible = createCallable(handlers.search);

module.exports = {
  getRemoteBibleBooks,
  getRemoteBibleChapter,
  searchRemoteBible,
  __testing: {
    ALLOWED_VERSION_IDS,
    BibleProxyError,
    createBibleProxyHandlers,
    createUnconfiguredBibleClient,
    createYouVersionProxyClient,
    toHttpsError,
  },
};
