"use strict";

const assert = require("node:assert/strict");
const {
  __testing: {
    BibleProxyError,
    createBibleProxyHandlers,
    createUnconfiguredBibleClient,
    createYouVersionProxyClient,
    toHttpsError,
  },
} = require("./bibleProxy");
const {
  YOU_VERSION_APP_KEY_HEADER,
  YouVersionBibleClient,
} = require("./youVersionBibleClient");

const authenticatedRequest = (data) => ({
  auth: { uid: "bible-proxy-test-user", token: { bibleAdmin: true } },
  data,
});

async function expectProxyError(operation, code) {
  await assert.rejects(operation, (error) => (
    error instanceof BibleProxyError && error.code === code
  ));
}

function createJohn3Html(versionId) {
  return Array.from({ length: 36 }, (_, index) => {
    const number = index + 1;
    const text = number === 16
      ? `<span class="wj">Texto ${versionId} del versículo 16.</span>`
      : number === 17
        ? `<i>Texto ${versionId} del versículo 17.</i>`
        : `Texto ${versionId} del versículo ${number}.`;

    return [
      number % 3 === 1 ? '<div class="p">' : "",
      `<span class="yv-v" v="${number}"></span>`,
      `<span class="yv-vlbl">${number}</span>`,
      text,
      number % 3 === 0 ? "</div>" : "",
    ].join("");
  }).join("");
}

async function main() {
  let externalRequests = 0;
  global.fetch = async () => {
    externalRequests += 1;
    throw new Error("Las pruebas no deben hacer solicitudes externas.");
  };

  const fakeHandlers = createBibleProxyHandlers({
    client: {
      async getBooks(versionId) {
        return [{
          versionId,
          bookId: "jhn",
          bookName: "Juan",
          abbreviation: "Jn",
          chapters: 21,
        }];
      },
      async getChapter(versionId, bookId, chapter) {
        return {
          versionId,
          versionLabel: versionId.toUpperCase(),
          versionName: "Versión de prueba",
          bookId,
          bookName: "Juan",
          chapter,
          verses: [{
            number: 16,
            text: "Texto de prueba.",
            reference: "Juan 3:16",
          }],
        };
      },
      async search(versionId, query) {
        return {
          total: 1,
          results: [{
            versionId,
            bookId: "jhn",
            bookName: "Juan",
            chapter: 3,
            verse: 16,
            text: query,
            reference: "Juan 3:16",
          }],
        };
      },
    },
    timeoutMs: 25,
  });

  assert.equal(
    (await fakeHandlers.getBooks(authenticatedRequest({
      versionId: "nbla",
    }))).books[0].bookId,
    "jhn"
  );
  assert.equal(
    (await fakeHandlers.getChapter(authenticatedRequest({
      versionId: "nbla",
      bookId: "jhn",
      chapter: 3,
    }))).verses[0].reference,
    "Juan 3:16"
  );
  assert.equal(
    (await fakeHandlers.search(authenticatedRequest({
      versionId: "nvi",
      query: "amor",
    }))).results[0].text,
    "amor"
  );

  await expectProxyError(
    () => fakeHandlers.getBooks({ data: { versionId: "nbla" } }),
    "UNAUTHENTICATED"
  );
  await expectProxyError(
    () => fakeHandlers.getBooks({
      auth: { uid: "unprivileged-user", token: { bibleAdmin: false } },
      data: { versionId: "nbla" },
    }),
    "VERSION_NOT_ALLOWED"
  );
  await expectProxyError(
    () => fakeHandlers.getBooks({
      auth: { uid: "unprivileged-user", token: {} },
      data: { versionId: "nbla" },
    }),
    "VERSION_NOT_ALLOWED"
  );
  await expectProxyError(
    () => fakeHandlers.getBooks(authenticatedRequest({
      versionId: "rv1909",
    })),
    "VERSION_NOT_ALLOWED"
  );
  await expectProxyError(
    () => fakeHandlers.getChapter(authenticatedRequest({
      versionId: "nbla",
      bookId: "jhn",
      chapter: 0,
    })),
    "INVALID_ARGUMENT"
  );

  const disabledHandlers = createBibleProxyHandlers({
    client: createUnconfiguredBibleClient(),
    timeoutMs: 25,
  });
  await expectProxyError(
    () => disabledHandlers.getBooks(authenticatedRequest({
      versionId: "nbla",
    })),
    "PROXY_NOT_CONFIGURED"
  );

  const appKey = "test-only-app-key";
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });

    if (url.endsWith("/books")) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        async json() {
          return {
            data: [{
              id: "JHN",
              title: "Juan",
              abbreviation: "Jn",
              canon: "new_testament",
              chapters: Array.from({ length: 21 }, (_, index) => ({
                id: index + 1,
              })),
            }],
          };
        },
      };
    }

    const sourceVersionId = url.match(/\/bibles\/(\d+)\//)?.[1];
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json; charset=utf-8" },
      async json() {
        return {
          data: {
            id: "JHN.3",
            reference: "Juan 3",
            content: createJohn3Html(sourceVersionId),
          },
        };
      },
    };
  };
  const realClient = createYouVersionProxyClient({
    getAppKey: () => appKey,
    createClient: ({ appKey: injectedKey }) =>
      new YouVersionBibleClient({
        appKey: injectedKey,
        fetchImpl,
      }),
  });
  const realHandlers = createBibleProxyHandlers({
    client: realClient,
    timeoutMs: 100,
  });
  const versions = [
    ["nbla", "103"],
    ["nvi", "2664"],
    ["biblia-libre", "3291"],
  ];
  const normalizedChapters = [];

  const books = await realHandlers.getBooks(authenticatedRequest({
    versionId: "nbla",
  }));
  assert.equal(books.books[0].bookId, "jhn");
  assert.equal(books.books[0].bookName, "Juan");
  assert.equal(books.books[0].chapters, 21);

  for (const [versionId, sourceId] of versions) {
    const chapter = await realHandlers.getChapter(authenticatedRequest({
      versionId,
      bookId: "jhn",
      chapter: 3,
    }));
    normalizedChapters.push(chapter);

    assert.equal(chapter.versionId, versionId);
    assert.equal(chapter.bookId, "jhn");
    assert.equal(chapter.chapter, 3);
    assert.equal(chapter.verses.length, 36);
    assert.equal(chapter.verses[15].number, 16);
    assert.equal(chapter.verses[16].number, 17);
    assert.notEqual(chapter.verses[15].text, chapter.verses[16].text);
    assert.equal(chapter.verses[15].text.includes("17"), false);
    assert.ok(requests.some(({ url }) => (
      url.includes(`/bibles/${sourceId}/passages/JHN.3`)
    )));
  }

  assert.ok(requests.every(({ options }) => (
    options.headers[YOU_VERSION_APP_KEY_HEADER] === appKey
  )));
  assert.equal(JSON.stringify(requests).includes(appKey), true);

  await expectProxyError(
    () => realHandlers.search(authenticatedRequest({
      versionId: "nvi",
      query: "amor",
    })),
    "SEARCH_NOT_SUPPORTED"
  );

  const callableError = toHttpsError(new BibleProxyError(
    "SEARCH_NOT_SUPPORTED",
    "Búsqueda no disponible."
  ));
  assert.equal(callableError.code, "unimplemented");
  assert.deepEqual(callableError.details, {
    proxyCode: "SEARCH_NOT_SUPPORTED",
  });

  assert.equal(externalRequests, 0);
  console.log(JSON.stringify({
    books: books.books.length,
    versions: normalizedChapters.map(({ versionId }) => versionId),
    john3VerseCounts: normalizedChapters.map(({ verses }) => verses.length),
    externalRequests,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
