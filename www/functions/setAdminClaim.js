const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const uid = process.argv[2];

if (!uid) {
  console.error("Por favor, proporciona el UID del usuario como argumento.");
  console.error("Ejemplo: node setAdminClaim.js <UID>");
  process.exit(1);
}

try {
  initializeApp();
} catch (error) {
  console.error("Error al inicializar Firebase Admin SDK. Asegúrate de configurar la variable de entorno GOOGLE_APPLICATION_CREDENTIALS.");
  console.error(error);
  process.exit(1);
}

getAuth()
  .setCustomUserClaims(uid, { bibleAdmin: true })
  .then(() => {
    console.log(`¡Éxito! Custom claim 'bibleAdmin: true' asignado al usuario con UID: ${uid}`);
    return getAuth().getUser(uid);
  })
  .then((userRecord) => {
    console.log("Claims actuales verificados en el backend:", userRecord.customClaims);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error al asignar custom claim:", error);
    process.exit(1);
  });
