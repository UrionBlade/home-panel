import type {
  CreateShoppingItemInput,
  Product,
  ShoppingItem,
  UpdateShoppingItemInput,
} from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";

const SHOPPING_KEY = ["shopping", "items"] as const;
const PRODUCTS_KEY = ["shopping", "products"] as const;

export function useShoppingItems() {
  return useQuery({
    queryKey: SHOPPING_KEY,
    queryFn: () => apiClient.get<ShoppingItem[]>("/api/v1/shopping/items"),
  });
}

export function useShoppingProducts(query: string) {
  return useQuery({
    queryKey: [...PRODUCTS_KEY, query],
    queryFn: () =>
      apiClient.get<Product[]>(`/api/v1/shopping/products?q=${encodeURIComponent(query)}`),
    enabled: query.length === 0 || query.length >= 1,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAddShoppingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateShoppingItemInput) =>
      apiClient.post<ShoppingItem>("/api/v1/shopping/items", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: SHOPPING_KEY }),
  });
}

export function useToggleShoppingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: ShoppingItem) =>
      apiClient.patch<ShoppingItem>(`/api/v1/shopping/items/${item.id}`, {
        completed: !item.completed,
      }),
    onMutate: async (item) => {
      await qc.cancelQueries({ queryKey: SHOPPING_KEY });
      const prev = qc.getQueryData<ShoppingItem[]>(SHOPPING_KEY);
      qc.setQueryData<ShoppingItem[]>(SHOPPING_KEY, (old) =>
        old?.map((i) => (i.id === item.id ? { ...i, completed: !i.completed } : i)),
      );
      return { prev };
    },
    onError: (_err, _item, ctx) => {
      if (ctx?.prev) qc.setQueryData(SHOPPING_KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: SHOPPING_KEY }),
  });
}

export function useUpdateShoppingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateShoppingItemInput }) =>
      apiClient.patch<ShoppingItem>(`/api/v1/shopping/items/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: SHOPPING_KEY }),
  });
}

export function useDeleteShoppingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/api/v1/shopping/items/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: SHOPPING_KEY });
      const prev = qc.getQueryData<ShoppingItem[]>(SHOPPING_KEY);
      qc.setQueryData<ShoppingItem[]>(SHOPPING_KEY, (old) => old?.filter((i) => i.id !== id));
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(SHOPPING_KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: SHOPPING_KEY }),
  });
}
