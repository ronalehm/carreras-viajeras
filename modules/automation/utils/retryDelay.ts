const BASE_DELAY_SECONDS = 30;
const MAX_DELAY_SECONDS = 3600;

// Exponential backoff with jitter: attempt 1 → 15–30 s, attempt 8 → 30–60 min. random ∈ [0, 1].
export function retryDelaySeconds(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(BASE_DELAY_SECONDS * 2 ** (attempt - 1), MAX_DELAY_SECONDS);
  return Math.round(ceiling * (0.5 + 0.5 * random()));
}
