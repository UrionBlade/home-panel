import type {
  CreateRecipeInput,
  GialloZafferanoRecipeDetails,
  GialloZafferanoSearchResult,
  ImportedRecipeData,
  Recipe,
  UpdateRecipeInput,
} from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";

const RECIPES_KEY = ["recipes"] as const;

interface RecipeFilters {
  tag?: string;
  favorite?: boolean;
  q?: string;
}

function buildQueryString(filters?: RecipeFilters): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.favorite) params.set("favorite", "true");
  if (filters.q) params.set("q", filters.q);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useRecipes(filters?: RecipeFilters) {
  return useQuery({
    queryKey: [...RECIPES_KEY, filters],
    queryFn: () => apiClient.get<Recipe[]>(`/api/v1/recipes${buildQueryString(filters)}`),
  });
}

export function useRecipe(id: string | null) {
  return useQuery({
    queryKey: [...RECIPES_KEY, id],
    queryFn: () => apiClient.get<Recipe>(`/api/v1/recipes/${id}`),
    enabled: !!id,
  });
}

export function useCreateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRecipeInput) => apiClient.post<Recipe>("/api/v1/recipes", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: RECIPES_KEY }),
  });
}

export function useUpdateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRecipeInput }) =>
      apiClient.patch<Recipe>(`/api/v1/recipes/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: RECIPES_KEY }),
  });
}

export function useDeleteRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/api/v1/recipes/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: RECIPES_KEY });
      const prev = qc.getQueryData<Recipe[]>(RECIPES_KEY);
      qc.setQueryData<Recipe[]>(RECIPES_KEY, (old) => old?.filter((r) => r.id !== id));
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(RECIPES_KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: RECIPES_KEY }),
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<Recipe>(`/api/v1/recipes/${id}/toggle-favorite`),
    onSuccess: () => qc.invalidateQueries({ queryKey: RECIPES_KEY }),
  });
}

export function useImportRecipeUrl() {
  return useMutation({
    mutationFn: (url: string) =>
      apiClient.post<ImportedRecipeData>("/api/v1/recipes/import-url", {
        url,
      }),
  });
}

/**
 * Ricerca ricette su giallozafferano.it tramite il backend.
 * Query activates only when query is >= 3 characters to avoid
 * richieste inutili mentre l'utente digita.
 */
export function useSearchGialloZafferano(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["recipes", "gz-search", trimmed],
    queryFn: () =>
      apiClient.get<GialloZafferanoSearchResult[]>(
        `/api/v1/recipes/gz/search?q=${encodeURIComponent(trimmed)}`,
      ),
    enabled: trimmed.length >= 3,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Ultime ricette pubblicate su giallozafferano.it (RSS feed).
 * Usate per popolare la landing della pagina Ricette quando l'utente
 * non ha ancora cercato nulla — mimando l'UX del vecchio home-panel.
 */
export function useGialloZafferanoFeed() {
  return useQuery({
    queryKey: ["recipes", "gz-feed"],
    queryFn: () => apiClient.get<GialloZafferanoSearchResult[]>("/api/v1/recipes/gz/feed"),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Dettaglio completo di una ricetta GialloZafferano — ingredienti con
 * separate quantities, steps with images, tips/storage sections.
 * Usato dal modal `RemoteRecipeDetail`.
 */
export function useGialloZafferanoDetails(url: string | null) {
  return useQuery({
    queryKey: ["recipes", "gz-details", url],
    queryFn: () =>
      apiClient.get<GialloZafferanoRecipeDetails>(
        `/api/v1/recipes/gz/details?url=${encodeURIComponent(url ?? "")}`,
      ),
    enabled: !!url,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}
