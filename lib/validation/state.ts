/** All 50 states, DC, and populated US territories — VAL-203 enumerated validation (O(1) lookup). */
export const VALID_US_STATES = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
  "PR",
  "VI",
  "GU",
  "MP",
  "AS",
]);

export const INVALID_US_STATE_MESSAGE = "Please enter a valid US state code";

export function validateStateCode(state: string): boolean {
  return VALID_US_STATES.has(state.toUpperCase());
}

/** Trim + uppercase for DB and comparison (call before validateStateCode). */
export function normalizeStateCode(state: string): string {
  return state.trim().toUpperCase();
}
