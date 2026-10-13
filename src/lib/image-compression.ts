// src/lib/image-compression.ts
'use client';

/**
 * Comprime y redimensiona una imagen en el navegador del cliente antes de subirla a Supabase Storage.
 * - Limita las dimensiones a un máximo de 800x800 manteniendo el aspect ratio.
 * - Convierte a formato WebP moderno con calidad 0.8 (ahorra >90% de almacenamiento y egress de CDN).
 */
export async function compressImageToWebP(
  file: File,
  maxDimension = 800,
  quality = 0.8
): Promise<File> {
  // Solo procesar imágenes
  if (!file.type.startsWith('image/')) {
    return file;
  }

  // Si no estamos en entorno browser (SSR), retornar el archivo original
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      // Calcular factor de escala si sobrepasa la dimensión máxima
      const maxDim = Math.max(width, height);
      if (maxDim > maxDimension) {
        const scale = maxDimension / maxDim;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file); // Fallback al original si canvas 2D no está disponible
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }

          // Conservar nombre base y cambiar extensión a .webp
          const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
          const compressedFile = new File([blob], `${baseName}.webp`, {
            type: 'image/webp',
            lastModified: Date.now(),
          });

          // Si por alguna razón la imagen comprimida resulta más pesada, conservar la más liviana
          if (compressedFile.size < file.size) {
            resolve(compressedFile);
          } else {
            resolve(file);
          }
        },
        'image/webp',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file); // Fallback al original si la imagen no puede ser parseada
    };

    img.src = objectUrl;
  });
}
