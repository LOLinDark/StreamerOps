/**
 * Utility to construct correct image paths for different deployment environments
 * Handles GitHub Pages subdirectory deployments (/StarCitizen-OmniCore/)
 * and local development (/assets/...)
 */

export function getImagePath(relativePath) {
  // On GitHub Pages, BASE_URL is set to '/StarCitizen-OmniCore/'
  // On local dev, BASE_URL is '/'
  // Handle both undefined and empty string cases
  let baseUrl = import.meta.env.BASE_URL;
  if (!baseUrl || baseUrl === '' || baseUrl === 'undefined') {
    baseUrl = '/';
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  
  // Remove leading slash from relative path if present
  const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  
  try {
    const resolvedBaseUrl = new URL(baseUrl, origin);
    return new URL(cleanPath, resolvedBaseUrl).pathname;
  } catch (e) {
    // Fallback: just prepend baseUrl if URL constructor fails
    console.warn('[pathUtils] URL construction failed, using fallback:', e.message);
    return baseUrl + cleanPath;
  }
}

/**
 * Helper to get asset URLs consistently
 * Usage: getAssetUrl('tools/hotas-config.png')
 */
export function getAssetUrl(assetPath) {
  return getImagePath(`assets/${assetPath}`);
}
