# Proxy bíblico remoto

Las Biblias remotas se consultan exclusivamente mediante Firebase Callable
Functions. La AppKey de YouVersion se lee desde el Secret
`JEFFERSON_BIBLE_API_KEY` y nunca se envía al frontend.

Versiones configuradas:

- `nbla` -> YouVersion `103`
- `nvi` -> YouVersion `128`
- `biblia-libre` -> YouVersion `3291`

## Callables

`getRemoteBibleBooks` recibe:

```json
{ "versionId": "nbla" }
```

Consulta `GET /v1/bibles/{version_id}/books` y devuelve libros normalizados.

`getRemoteBibleChapter` recibe:

```json
{
  "versionId": "nbla",
  "bookId": "jhn",
  "chapter": 3
}
```

Consulta Passages con `JHN.3`, separa los versículos mediante los marcadores
`span.yv-v[v]` y devuelve el modelo normalizado usado por la app.

`searchRemoteBible` recibe `versionId`, `query`, `limit` y `page`. YouVersion
Platform no documenta un endpoint de búsqueda textual para esta integración,
por lo que actualmente responde `unimplemented` con
`proxyCode: "SEARCH_NOT_SUPPORTED"`.

Todas las callables requieren Firebase Authentication. No se persisten textos
remotos en Firestore; el frontend mantiene únicamente caché en memoria durante
la sesión.

## Secret

```sh
firebase functions:secrets:set JEFFERSON_BIBLE_API_KEY
```

No se deben escribir valores reales en archivos JavaScript, `.env`, el
repositorio, la app web ni el APK.
