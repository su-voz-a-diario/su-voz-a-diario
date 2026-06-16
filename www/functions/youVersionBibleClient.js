"use strict";

const YOU_VERSION_BASE_URL = "https://api.youversion.com/v1";
const YOU_VERSION_APP_KEY_HEADER = "X-YVP-App-Key";

class YouVersionClientError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "YouVersionClientError";
    this.code = code;
    this.details = details;
  }
}

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new YouVersionClientError(
      "PROXY_NOT_CONFIGURED",
      `${fieldName} no está configurado.`
    );
  }

  return value.trim();
}

function safeErrorMessage(error, secret = "") {
  const rawMessage = String(error?.message || "Error desconocido");
  const redacted = secret
    ? rawMessage.split(secret).join("[REDACTED]")
    : rawMessage;

  return redacted.slice(0, 300);
}

function sanitizeErrorBody(payload, secret = "") {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      errorBodyKeys: [],
      errorBodyCode: null,
      errorBodyMessage: null,
      errorBodyErrors: null,
    };
  }

  const sensitiveKeyPattern = /(app.?key|api.?key|authorization|token|secret|password)/i;
  const keys = Object.keys(payload)
    .filter((key) => !sensitiveKeyPattern.test(key))
    .slice(0, 30);
  const code = payload.code ?? payload.error?.code ?? null;
  const message = payload.message ??
    payload.error_description ??
    payload.error?.message ??
    null;
  const errors = payload.errors ?? payload.error?.errors ?? null;
  const summary = {
    errorBodyKeys: keys,
    errorBodyCode: code === null ? null : String(code).slice(0, 100),
    errorBodyMessage: message === null
      ? null
      : safeErrorMessage({ message }, secret),
    errorBodyErrors: null,
  };

  if (errors !== null && errors !== undefined) {
    try {
      const serializedErrors = JSON.stringify(errors);

      if (serializedErrors.length <= 500) {
        summary.errorBodyErrors = JSON.parse(serializedErrors);
      }
    } catch {
      summary.errorBodyErrors = null;
    }
  }

  while (JSON.stringify(summary).length > 1000) {
    if (summary.errorBodyErrors !== null) {
      summary.errorBodyErrors = null;
      continue;
    }

    if (summary.errorBodyMessage?.length > 50) {
      summary.errorBodyMessage = summary.errorBodyMessage.slice(
        0,
        Math.max(50, summary.errorBodyMessage.length - 100)
      );
      continue;
    }

    summary.errorBodyKeys.pop();
  }

  return summary;
}

function getBibleList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.bibles)) return payload.bibles;
  if (Array.isArray(payload?.data?.bibles)) return payload.data.bibles;

  throw new YouVersionClientError(
    "INVALID_UPSTREAM_RESPONSE",
    "YouVersion devolvió un catálogo de Biblias inválido."
  );
}

function getBookList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.books)) return payload.books;

  throw new YouVersionClientError(
    "INVALID_UPSTREAM_RESPONSE",
    "YouVersion devolvió una lista de libros inválida."
  );
}

function getVerseList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.verses)) return payload.verses;
  if (Array.isArray(payload?.data?.verses)) return payload.data.verses;

  throw new YouVersionClientError(
    "INVALID_UPSTREAM_RESPONSE",
    "YouVersion devolvió una lista de versículos inválida."
  );
}

function summarizeCandidateValue(value, fieldName) {
  if (typeof value === "string") {
    const isContentField = ["content", "text", "html"].includes(fieldName);

    return isContentField
      ? {
          type: "string",
          length: value.length,
          preview: value.slice(0, 20),
        }
      : {
          type: "string",
          length: value.length,
          value: value.slice(0, 100),
        };
  }

  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
    };
  }

  if (value && typeof value === "object") {
    return {
      type: "object",
      keys: Object.keys(value).slice(0, 20),
    };
  }

  return {
    type: value === null ? "null" : typeof value,
    value,
  };
}

function summarizeVersePayloadShape(payload) {
  const topLevelKeys = payload && typeof payload === "object"
    ? Object.keys(payload).slice(0, 30)
    : [];
  const data = payload?.data;
  const dataKeys = data && typeof data === "object" && !Array.isArray(data)
    ? Object.keys(data).slice(0, 30)
    : [];
  let verses = null;

  if (Array.isArray(payload)) verses = payload;
  else if (Array.isArray(payload?.verses)) verses = payload.verses;
  else if (Array.isArray(payload?.data)) verses = payload.data;
  else if (Array.isArray(payload?.data?.verses)) verses = payload.data.verses;

  const first = verses?.[0];
  const candidateNames = [
    "id",
    "usfm",
    "reference",
    "content",
    "text",
    "html",
    "verse",
    "number",
  ];
  const candidates = {};

  if (first && typeof first === "object" && !Array.isArray(first)) {
    for (const fieldName of candidateNames) {
      if (Object.hasOwn(first, fieldName)) {
        candidates[fieldName] = summarizeCandidateValue(
          first[fieldName],
          fieldName
        );
      }
    }
  }

  return {
    topLevelKeys,
    dataKeys,
    firstVerse: first && typeof first === "object"
      ? {
          keys: Object.keys(first).slice(0, 30),
          valueTypes: Object.fromEntries(
            Object.entries(first)
              .slice(0, 30)
              .map(([key, value]) => [
                key,
                Array.isArray(value)
                  ? "array"
                  : value === null
                    ? "null"
                    : typeof value,
              ])
          ),
          candidates,
        }
      : null,
  };
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function getNestedValue(value, candidateKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  return firstDefined(...candidateKeys.map((key) => value[key]));
}

function getHtmlAttribute(attributes, name) {
  const match = String(attributes || "").match(
    new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, "i")
  );

  return match?.[2] ?? null;
}

function hasHtmlClass(attributes, className) {
  const classes = getHtmlAttribute(attributes, "class");

  return classes
    ? classes.split(/\s+/).includes(className)
    : false;
}

function removeVisualVerseLabels(html) {
  return String(html || "").replace(
    /<span\b([^>]*)>[\s\S]*?<\/span>/gi,
    (match, attributes) => (
      hasHtmlClass(attributes, "yv-vlbl") ? "" : match
    )
  );
}

function extractPassageVerses(content) {
  const html = String(content || "");
  const markerPattern = /<span\b([^>]*)>\s*<\/span>/gi;
  const markers = [];

  for (const match of html.matchAll(markerPattern)) {
    const attributes = match[1];
    const number = Number(getHtmlAttribute(attributes, "v"));

    if (
      hasHtmlClass(attributes, "yv-v") &&
      Number.isInteger(number) &&
      number > 0
    ) {
      markers.push({
        number,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  const verses = [];

  for (const [index, marker] of markers.entries()) {
    const nextMarker = markers[index + 1];
    const verseHtml = html.slice(
      marker.end,
      nextMarker?.start ?? html.length
    );
    const text = htmlToPlainText(removeVisualVerseLabels(verseHtml));

    if (text) {
      verses.push({
        number: marker.number,
        text,
        reference: "",
      });
    }
  }

  return verses;
}

function decodeHtmlEntities(value) {
  const entities = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
  };

  return String(value || "").replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (match, entity) => {
      const normalized = entity.toLowerCase();

      if (normalized.startsWith("#x")) {
        const codePoint = Number.parseInt(normalized.slice(2), 16);
        return Number.isInteger(codePoint) && codePoint <= 0x10FFFF
          ? String.fromCodePoint(codePoint)
          : match;
      }

      if (normalized.startsWith("#")) {
        const codePoint = Number.parseInt(normalized.slice(1), 10);
        return Number.isInteger(codePoint) && codePoint <= 0x10FFFF
          ? String.fromCodePoint(codePoint)
          : match;
      }

      return entities[normalized] ?? match;
    }
  );
}

function htmlToPlainText(value) {
  return decodeHtmlEntities(
    String(value || "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|section)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function detectContentFormat(value, payload) {
  const declared = String(
    payload?.format ||
    payload?.content_format ||
    payload?.data?.format ||
    payload?.data?.content_format ||
    ""
  ).trim().toLowerCase();

  if (declared) return declared;
  return /<[^>]+>/.test(String(value || "")) ? "html" : "text";
}

function normalizeVerse(verse, index, payload) {
  if (!verse || typeof verse !== "object" || Array.isArray(verse)) {
    throw new YouVersionClientError(
      "INVALID_UPSTREAM_RESPONSE",
      "YouVersion devolvió un versículo inválido."
    );
  }

  const verseCandidate = getNestedValue(verse.verse, [
    "number",
    "verse",
    "verse_number",
    "verseNumber",
  ]);
  const numberCandidate = getNestedValue(verse.number, [
    "number",
    "value",
  ]);
  const directNumber = Number(firstDefined(
    numberCandidate,
    verseCandidate,
    verse.verse_number,
    verse.verseNumber
  ));
  const sourceId = String(
    getNestedValue(verse.id, ["id", "value", "usfm"]) ||
    getNestedValue(verse.usfm, ["id", "value", "usfm"]) ||
    getNestedValue(verse.verse_id, ["id", "value", "usfm"]) ||
    getNestedValue(verse.verseId, ["id", "value", "usfm"]) ||
    ""
  ).trim();
  const referenceCandidate = String(
    getNestedValue(verse.reference, [
      "human",
      "label",
      "reference",
      "value",
      "usfm",
    ]) || ""
  ).trim();
  const idNumberMatch = `${sourceId} ${referenceCandidate}`
    .match(/(?:\.|:|\s)(\d+)(?:-\d+)?(?:\D*)$/);
  const number = Number.isInteger(directNumber) && directNumber > 0
    ? directNumber
    : Number(idNumberMatch?.[1]);
  const rawTextCandidate = firstDefined(
    verse.text,
    verse.content,
    verse.html,
    verse.verse_text,
    verse.verseText,
    verse.formatted_text,
    verse.formattedText
  );
  const rawText = getNestedValue(rawTextCandidate, [
    "html",
    "text",
    "content",
    "value",
  ]) ?? "";

  if (!Number.isInteger(number) || number < 1 || !String(rawText).trim()) {
    throw new YouVersionClientError(
      "INVALID_UPSTREAM_RESPONSE",
      `YouVersion devolvió un versículo inválido en la posición ${index}.`
    );
  }

  return {
    number,
    text: htmlToPlainText(rawText),
    reference: String(
      referenceCandidate ||
      verse.human_reference ||
      verse.humanReference ||
      ""
    ).trim(),
    sourceId,
    sourceFormat: detectContentFormat(rawText, payload),
  };
}

function getResponseMetadata(payload) {
  const data = payload?.data && !Array.isArray(payload.data)
    ? payload.data
    : {};
  const attribution = payload?.attribution ??
    payload?.attribution_text ??
    data.attribution ??
    data.attribution_text ??
    null;
  const copyright = payload?.copyright ??
    payload?.copyright_text ??
    data.copyright ??
    data.copyright_text ??
    null;
  const license = payload?.license ??
    payload?.license_text ??
    data.license ??
    data.license_text ??
    null;

  return {
    attribution: attribution === null ? null : htmlToPlainText(attribution),
    copyright: copyright === null ? null : htmlToPlainText(copyright),
    license: license === null ? null : htmlToPlainText(license),
  };
}

function normalizeLanguage(language) {
  if (typeof language === "string") {
    return {
      id: "",
      name: language.trim(),
      tag: "",
    };
  }

  return {
    id: String(language?.id || "").trim(),
    name: String(
      language?.name ||
      language?.localName ||
      language?.name_local ||
      language?.localizedName ||
      ""
    ).trim(),
    tag: String(
      language?.tag ||
      language?.iso639 ||
      language?.iso639_1 ||
      language?.iso639_3 ||
      language?.iso_639_1 ||
      language?.iso_639_3 ||
      ""
    ).trim(),
  };
}

function normalizeBible(bible) {
  if (!bible || typeof bible !== "object" || Array.isArray(bible)) {
    throw new YouVersionClientError(
      "INVALID_UPSTREAM_RESPONSE",
      "YouVersion devolvió una Biblia inválida."
    );
  }

  const id = String(bible.id || bible.bibleId || "").trim();
  const abbreviation = String(
    bible.abbreviation ||
    bible.abbreviationLocal ||
    bible.abbreviation_local ||
    bible.localAbbreviation ||
    ""
  ).trim();
  const name = String(
    bible.name ||
    bible.title ||
    bible.localizedTitle ||
    bible.localTitle ||
    bible.name_local ||
    ""
  ).trim();

  if (!id || (!abbreviation && !name)) {
    throw new YouVersionClientError(
      "INVALID_UPSTREAM_RESPONSE",
      "YouVersion devolvió una Biblia sin ID o nombre."
    );
  }

  return {
    id,
    abbreviation,
    name,
    language: normalizeLanguage(
      bible.language || bible.languageInfo || bible.languageName
    ),
  };
}

class YouVersionBibleClient {
  constructor({
    appKey,
    baseUrl = YOU_VERSION_BASE_URL,
    fetchImpl = globalThis.fetch,
    logger = null,
  } = {}) {
    this.appKey = requireNonEmptyString(appKey, "JEFFERSON_BIBLE_API_KEY");
    this.baseUrl = requireNonEmptyString(baseUrl, "YouVersion base URL")
      .replace(/\/+$/, "");

    if (typeof fetchImpl !== "function") {
      throw new YouVersionClientError(
        "PROXY_NOT_CONFIGURED",
        "El transporte HTTP de YouVersion no está disponible."
      );
    }

    this.fetchImpl = fetchImpl;
    this.logger = logger;
  }

  logInfo(message, data) {
    if (typeof this.logger?.info === "function") {
      this.logger.info(message, data);
    }
  }

  logError(message, error, code) {
    if (typeof this.logger?.error === "function") {
      this.logger.error(message, {
        internalCode: code,
        errorName: String(error?.name || "Error"),
        errorMessage: safeErrorMessage(error, this.appKey),
        causeCode: error?.cause?.code
          ? String(error.cause.code)
          : null,
      });
    }
  }

  async getBibles({ signal } = {}) {
    let response;
    const url = `${this.baseUrl}/bibles?language_ranges[]=es`;
    const debug = {
      requestedUrl: url,
      status: null,
      contentType: null,
      responseOk: null,
      errorName: null,
      errorMessage: null,
      errorCauseCode: null,
      internalCode: null,
    };

    this.logInfo("YouVersion: iniciando solicitud de catálogo.", {
      url,
    });

    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          [YOU_VERSION_APP_KEY_HEADER]: this.appKey,
        },
        signal,
      });
    } catch (error) {
      if (error?.name === "AbortError" || signal?.aborted) {
        const code = "UPSTREAM_TIMEOUT";
        Object.assign(debug, {
          errorName: String(error?.name || "Error"),
          errorMessage: safeErrorMessage(error, this.appKey),
          errorCauseCode: error?.cause?.code
            ? String(error.cause.code)
            : null,
          internalCode: code,
        });
        this.logError(
          "YouVersion: solicitud cancelada por timeout.",
          error,
          code
        );
        throw new YouVersionClientError(
          code,
          "YouVersion tardó demasiado en responder.",
          { debug }
        );
      }

      const code = "UPSTREAM_UNAVAILABLE";
      Object.assign(debug, {
        errorName: String(error?.name || "Error"),
        errorMessage: safeErrorMessage(error, this.appKey),
        errorCauseCode: error?.cause?.code
          ? String(error.cause.code)
          : null,
        internalCode: code,
      });
      this.logError(
        "YouVersion: error de transporte.",
        error,
        code
      );
      throw new YouVersionClientError(
        code,
        "No fue posible contactar a YouVersion.",
        { debug }
      );
    }

    const contentType = typeof response?.headers?.get === "function"
      ? response.headers.get("content-type")
      : null;

    this.logInfo("YouVersion: respuesta HTTP recibida.", {
      url,
      status: Number.isInteger(response?.status) ? response.status : null,
      contentType: contentType || null,
      responseOk: response?.ok === true,
    });
    Object.assign(debug, {
      status: Number.isInteger(response?.status) ? response.status : null,
      contentType: contentType || null,
      responseOk: response?.ok === true,
    });

    if (!response || typeof response.ok !== "boolean") {
      debug.internalCode = "INVALID_UPSTREAM_RESPONSE";
      throw new YouVersionClientError(
        "INVALID_UPSTREAM_RESPONSE",
        "YouVersion devolvió una respuesta HTTP inválida.",
        { debug }
      );
    }

    if (!response.ok) {
      const code = response.status === 401 || response.status === 403
        ? "UPSTREAM_AUTH_FAILED"
        : response.status === 429
          ? "UPSTREAM_RATE_LIMITED"
          : "UPSTREAM_UNAVAILABLE";
      Object.assign(debug, {
        errorName: "YouVersionClientError",
        errorMessage: `YouVersion respondió con estado HTTP ${response.status}.`,
        internalCode: code,
      });

      try {
        const errorPayload = await response.json();
        Object.assign(debug, sanitizeErrorBody(errorPayload, this.appKey));
      } catch {
        Object.assign(debug, sanitizeErrorBody(null, this.appKey));
      }

      throw new YouVersionClientError(
        code,
        `YouVersion respondió con estado HTTP ${response.status}.`,
        { status: response.status, debug }
      );
    }

    let payload;

    try {
      payload = await response.json();
    } catch (error) {
      Object.assign(debug, {
        errorName: String(error?.name || "Error"),
        errorMessage: "YouVersion devolvió JSON inválido.",
        errorCauseCode: error?.cause?.code
          ? String(error.cause.code)
          : null,
        internalCode: "INVALID_UPSTREAM_RESPONSE",
      });
      throw new YouVersionClientError(
        "INVALID_UPSTREAM_RESPONSE",
        "YouVersion devolvió JSON inválido.",
        { debug }
      );
    }

    try {
      return getBibleList(payload).map(normalizeBible);
    } catch (error) {
      Object.assign(debug, {
        errorName: String(error?.name || "Error"),
        errorMessage: safeErrorMessage(error, this.appKey),
        errorCauseCode: error?.cause?.code
          ? String(error.cause.code)
          : null,
        internalCode: String(
          error?.code || "INVALID_UPSTREAM_RESPONSE"
        ),
      });
      error.details = {
        ...(error.details || {}),
        debug,
      };
      throw error;
    }
  }

  async getBooks({ versionId, signal } = {}) {
    const normalizedVersionId = requireNonEmptyString(
      String(versionId || ""),
      "YouVersion version ID"
    );
    const url = `${this.baseUrl}/bibles/` +
      `${encodeURIComponent(normalizedVersionId)}/books`;
    let response;

    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          [YOU_VERSION_APP_KEY_HEADER]: this.appKey,
        },
        signal,
      });
    } catch (error) {
      const code = error?.name === "AbortError" || signal?.aborted
        ? "UPSTREAM_TIMEOUT"
        : "UPSTREAM_UNAVAILABLE";

      throw new YouVersionClientError(
        code,
        code === "UPSTREAM_TIMEOUT"
          ? "YouVersion tardó demasiado en responder."
          : "No fue posible contactar a YouVersion."
      );
    }

    if (!response?.ok) {
      const code = response?.status === 401 || response?.status === 403
        ? "UPSTREAM_AUTH_FAILED"
        : response?.status === 404
          ? "NOT_FOUND"
          : response?.status === 429
            ? "UPSTREAM_RATE_LIMITED"
            : "UPSTREAM_UNAVAILABLE";

      throw new YouVersionClientError(
        code,
        `YouVersion respondió con estado HTTP ${response?.status || 0}.`
      );
    }

    let payload;

    try {
      payload = await response.json();
    } catch {
      throw new YouVersionClientError(
        "INVALID_UPSTREAM_RESPONSE",
        "YouVersion devolvió JSON inválido para los libros."
      );
    }

    return getBookList(payload).map((book, index) => {
      const bookId = String(book?.id || "").trim().toUpperCase();
      const bookName = String(
        book?.title || book?.full_title || bookId
      ).trim();
      const chapters = Array.isArray(book?.chapters)
        ? book.chapters.length
        : Number(book?.chapter_count);

      if (
        !bookId ||
        !bookName ||
        !Number.isInteger(chapters) ||
        chapters < 1
      ) {
        throw new YouVersionClientError(
          "INVALID_UPSTREAM_RESPONSE",
          `YouVersion devolvió un libro inválido en la posición ${index}.`
        );
      }

      return {
        bookId: bookId.toLowerCase(),
        sourceBookId: bookId,
        bookName,
        abbreviation: String(book?.abbreviation || bookName).trim(),
        testament: String(book?.canon || "").trim().toLowerCase(),
        chapters,
        order: index + 1,
      };
    });
  }

  async getChapterVerses({
    versionId,
    bookUsfm,
    chapter,
    signal,
  } = {}) {
    const normalizedVersionId = requireNonEmptyString(
      String(versionId || ""),
      "YouVersion version ID"
    );
    const normalizedBookUsfm = requireNonEmptyString(
      String(bookUsfm || ""),
      "USFM book ID"
    ).toUpperCase();
    const normalizedChapter = Number(chapter);

    if (!Number.isInteger(normalizedChapter) || normalizedChapter < 1) {
      throw new YouVersionClientError(
        "INVALID_ARGUMENT",
        "El capítulo de YouVersion no es válido."
      );
    }

    const passageId = `${normalizedBookUsfm}.${normalizedChapter}`;
    const query = new URLSearchParams({
      format: "html",
      include_headings: "false",
      include_notes: "false",
    });
    const url = `${this.baseUrl}/bibles/` +
      `${encodeURIComponent(normalizedVersionId)}/passages/` +
      `${encodeURIComponent(passageId)}?${query.toString()}`;
    const debug = {
      requestedUrl: url,
      status: null,
      contentType: null,
      responseOk: null,
      errorName: null,
      errorMessage: null,
      errorCauseCode: null,
      internalCode: null,
      errorBodyKeys: [],
      errorBodyCode: null,
      errorBodyMessage: null,
      errorBodyErrors: null,
    };
    let response;

    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          [YOU_VERSION_APP_KEY_HEADER]: this.appKey,
        },
        signal,
      });
    } catch (error) {
      const code = error?.name === "AbortError" || signal?.aborted
        ? "UPSTREAM_TIMEOUT"
        : "UPSTREAM_UNAVAILABLE";
      Object.assign(debug, {
        errorName: String(error?.name || "Error"),
        errorMessage: safeErrorMessage(error, this.appKey),
        errorCauseCode: error?.cause?.code
          ? String(error.cause.code)
          : null,
        internalCode: code,
      });

      throw new YouVersionClientError(
        code,
        code === "UPSTREAM_TIMEOUT"
          ? "YouVersion tardó demasiado en responder."
          : "No fue posible contactar a YouVersion.",
        { debug }
      );
    }

    const contentType = typeof response?.headers?.get === "function"
      ? response.headers.get("content-type")
      : null;
    Object.assign(debug, {
      status: Number.isInteger(response?.status) ? response.status : null,
      contentType: contentType || null,
      responseOk: response?.ok === true,
    });

    if (!response?.ok) {
      const code = response?.status === 401 || response?.status === 403
        ? "UPSTREAM_AUTH_FAILED"
        : response?.status === 404
          ? "NOT_FOUND"
          : response?.status === 429
            ? "UPSTREAM_RATE_LIMITED"
            : "UPSTREAM_UNAVAILABLE";
      Object.assign(debug, {
        errorName: "YouVersionClientError",
        errorMessage:
          `YouVersion respondió con estado HTTP ${response?.status || 0}.`,
        internalCode: code,
      });

      try {
        const errorPayload = await response.json();
        Object.assign(debug, sanitizeErrorBody(errorPayload, this.appKey));
      } catch {
        Object.assign(debug, sanitizeErrorBody(null, this.appKey));
      }

      throw new YouVersionClientError(
        code,
        `YouVersion respondió con estado HTTP ${response?.status || 0}.`,
        { debug }
      );
    }

    let payload;

    try {
      payload = await response.json();
    } catch (error) {
      Object.assign(debug, {
        errorName: String(error?.name || "Error"),
        errorMessage: "YouVersion devolvió JSON inválido para el capítulo.",
        errorCauseCode: error?.cause?.code
          ? String(error.cause.code)
          : null,
        internalCode: "INVALID_UPSTREAM_RESPONSE",
      });
      throw new YouVersionClientError(
        "INVALID_UPSTREAM_RESPONSE",
        "YouVersion devolvió JSON inválido para el capítulo.",
        { debug }
      );
    }

    let verses;
    const passageRoot = payload?.data &&
      typeof payload.data === "object" &&
      !Array.isArray(payload.data)
      ? payload.data
      : payload;
    try {
      const passageContent = firstDefined(
        passageRoot?.content,
        passageRoot?.html,
        passageRoot?.text
      );

      if (passageContent !== undefined && passageContent !== null) {
        verses = extractPassageVerses(passageContent);
      } else {
        verses = getVerseList(payload).map((verse, index) =>
          normalizeVerse(verse, index, payload)
        );
      }

      if (!Array.isArray(verses) || verses.length === 0) {
        throw new YouVersionClientError(
          "INVALID_UPSTREAM_RESPONSE",
          "YouVersion devolvió un pasaje sin marcadores de versículo reconocibles."
        );
      }
    } catch (error) {
      Object.assign(debug, {
        errorName: String(error?.name || "Error"),
        errorMessage: safeErrorMessage(error, this.appKey),
        errorCauseCode: error?.cause?.code
          ? String(error.cause.code)
          : null,
        internalCode: String(
          error?.code || "INVALID_UPSTREAM_RESPONSE"
        ),
      });
      error.details = {
        ...(error.details || {}),
        debug,
      };
      throw error;
    }
    const sourceFormats = [...new Set(
      verses.map((verse) => verse.sourceFormat || detectContentFormat(
        passageRoot?.content || passageRoot?.html || passageRoot?.text,
        payload
      ))
    )];

    return {
      verses: verses.map(({ sourceFormat, ...verse }) => ({
        ...verse,
        reference: verse.reference ||
          `${passageRoot?.reference || passageId}:${verse.number}`,
      })),
      sourceFormat: sourceFormats.length === 1
        ? sourceFormats[0]
        : "mixed",
      passageId: String(passageRoot?.id || passageId),
      passageReference: String(passageRoot?.reference || ""),
      ...getResponseMetadata(payload),
    };
  }
}

module.exports = {
  YOU_VERSION_BASE_URL,
  YOU_VERSION_APP_KEY_HEADER,
  YouVersionBibleClient,
  YouVersionClientError,
};
