/** @type {import('next').NextConfig} */
module.exports = {
  // Optimiseur d'images désactivé : faille critique de Next 14.2.x (corrigée en 15.5+). Retirer après le passage en Next 15 (T-022.9).
  images: { unoptimized: true },
};
