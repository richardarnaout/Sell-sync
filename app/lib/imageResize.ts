// T-034.3 (réserve T-033.4 A5) : photo des modèles de vente réduite dans le navigateur avant enregistrement.
// Une photo de téléphone (plusieurs Mo en base64) faisait échouer l'insertion en silence.

export const TEMPLATE_IMAGE_MAX_PX = 1280;
export const TEMPLATE_IMAGE_MAX_BYTES = 300_000;

/** Dimensions réduites (côté le plus long ≤ max), proportions gardées, jamais agrandies. */
export function fitWithin(w: number, h: number, max = TEMPLATE_IMAGE_MAX_PX): { w: number; h: number } {
  if (!(w > 0 && h > 0)) return { w: 0, h: 0 };
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Taille en octets du contenu d'une data URL base64. */
export function dataUrlBytes(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

/** Fichier image → data URL JPEG ≤ 1280 px et ≤ 300 Ko (qualité puis dimensions baissées si besoin). */
export async function resizeImageFile(file: File, maxPx = TEMPLATE_IMAGE_MAX_PX, maxBytes = TEMPLATE_IMAGE_MAX_BYTES): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error('Image illisible : choisis une photo JPEG, PNG ou WebP.'));
      i.src = url;
    });
    let { w, h } = fitWithin(img.naturalWidth, img.naturalHeight, maxPx);
    if (!w) throw new Error('Image illisible.');
    const canvas = document.createElement('canvas');
    for (let pass = 0; pass < 6; pass++) {
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Réduction de la photo impossible sur cet appareil.');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); // fond blanc pour les PNG transparents
      ctx.drawImage(img, 0, 0, w, h);
      for (const q of [0.82, 0.7, 0.58]) {
        const out = canvas.toDataURL('image/jpeg', q);
        if (dataUrlBytes(out) <= maxBytes) return out;
      }
      ({ w, h } = fitWithin(w, h, Math.round(Math.max(w, h) * 0.75)));
    }
    throw new Error('Photo trop lourde même réduite : choisis-en une autre.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
