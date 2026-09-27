export function jupBase(): { url: string; headers: Record<string, string> } {
  const key = process.env.JUPITER_API_KEY;
  return key
    ? { url: "https://api.jup.ag/swap/v1", headers: { "x-api-key": key } }
    : { url: "https://lite-api.jup.ag/swap/v1", headers: {} };
}
