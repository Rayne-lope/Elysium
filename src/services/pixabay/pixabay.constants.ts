export const PIXABAY_API_URL = 'https://pixabay.com/api/';
export const PIXABAY_CACHE_TTL_SECONDS = 86_400;
export const PIXABAY_MAX_QUERY_LENGTH = 100;
export const PIXABAY_MAX_PER_PAGE = 50;
export const PIXABAY_MAX_IMPORT_BATCH = 50;
export const PIXABAY_MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export const PIXABAY_CATEGORIES = [
  'backgrounds',
  'fashion',
  'nature',
  'science',
  'education',
  'feelings',
  'health',
  'people',
  'religion',
  'places',
  'animals',
  'industry',
  'computer',
  'food',
  'sports',
  'transportation',
  'travel',
  'buildings',
  'business',
  'music',
] as const;

export const PIXABAY_CATEGORY_MAP: Readonly<Record<string, string>> = {
  nature: 'nature',
  places: 'architecture',
  buildings: 'architecture',
  backgrounds: 'abstract',
  travel: 'travel',
  animals: 'animals',
  people: 'people',
};
