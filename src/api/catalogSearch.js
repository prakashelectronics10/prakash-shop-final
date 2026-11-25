import { apiRequest } from "./client";

export async function requestCatalogResults(path, query, { cacheTtl, startAnalysis }) {
  const response = await apiRequest(`${path}?${query}`, { cacheTtl });
  if (response.data?.total !== 0 || !response.data.canAnalyze || !startAnalysis()) return response;

  const analysisQuery = new URLSearchParams(query);
  analysisQuery.set("smartSearch", "analyze");
  return apiRequest(`${path}?${analysisQuery}`, { cache: "no-store" });
}
