import * as SecureStore from "expo-secure-store";
import type { Status, Workspace } from "./model";
const base = (
  process.env.EXPO_PUBLIC_API_URL || "https://tribe-i.ru/sadovskiy-mobile"
).replace(/\/$/, "");
const key = "featureflow-session-v1";
export const configured = Boolean(base);
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function request(
  path: string,
  token?: string,
  body?: unknown,
): Promise<any> {
  if (!base) throw new Error("Сначала укажи EXPO_PUBLIC_API_URL");
  if (!base.startsWith("https://") && !__DEV__)
    throw new Error("Для рабочей версии требуется HTTPS");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok)
      throw new ApiError(
        data.error || "Не удалось выполнить запрос",
        response.status,
      );
    return data;
  } finally {
    clearTimeout(timeout);
  }
}
export const session = {
  read: () => SecureStore.getItemAsync(key),
  save: (token: string) =>
    SecureStore.setItemAsync(key, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  clear: () => SecureStore.deleteItemAsync(key),
};
export const api = {
  login: (login: string, password: string): Promise<{ token: string }> =>
    request("/login", undefined, { login, password }),
  workspace: (token: string): Promise<Workspace> =>
    request("/workspace", token),
  create: (
    token: string,
    title: string,
    description: string,
    platforms: string[],
  ): Promise<Workspace> =>
    request("/features", token, { title, description, platforms }),
  update: (
    token: string,
    feature: string,
    item: string,
    status: Status,
    comment: string,
    version: number,
  ): Promise<Workspace> =>
    request("/items", token, { feature, item, status, comment, version }),
  logout: (token: string) => request("/logout", token, {}),
};
