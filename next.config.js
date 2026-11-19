/** @type {import('next').NextConfig} */
module.exports = {
  // Racine fixée au projet : un package-lock.json parasite existe dans le dossier utilisateur et tromperait Next 15.
  outputFileTracingRoot: __dirname,
};
