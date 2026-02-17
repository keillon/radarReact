import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "./api";

const AUTH_TOKEN_KEY = "radarbot_auth_token";
const AUTH_USER_KEY = "radarbot_auth_user";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  createdAt?: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

export async function login(
  email: string,
  password: string
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Erro ao fazer login");
  }
  await AsyncStorage.setItem(AUTH_TOKEN_KEY, data.token);
  await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
  return data;
}

export async function register(
  email: string,
  password: string,
  name?: string
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: email.trim(),
      password,
      name: name?.trim() || undefined,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Erro ao criar conta");
  }
  await AsyncStorage.setItem(AUTH_TOKEN_KEY, data.token);
  await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
  return data;
}

export async function logout(): Promise<void> {
  await AsyncStorage.multiRemove([AUTH_TOKEN_KEY, AUTH_USER_KEY]);
}

export async function getStoredAuth(): Promise<{
  token: string;
  user: AuthUser;
} | null> {
  const [token, userJson] = await AsyncStorage.multiGet([
    AUTH_TOKEN_KEY,
    AUTH_USER_KEY,
  ]);
  const t = token?.[1];
  const u = userJson?.[1];
  if (!t || !u) return null;
  try {
    const user = JSON.parse(u) as AuthUser;
    if (user?.id && user?.email) return { token: t, user };
  } catch {
    return null;
  }
  return null;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const stored = await getStoredAuth();
  if (!stored?.token) throw new Error("Não autenticado");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${stored.token}`,
  };
}

export async function updateProfile(data: { name?: string }): Promise<AuthUser> {
  const res = await fetch(`${API_BASE_URL}/auth/profile`, {
    method: "PATCH",
    headers: await getAuthHeaders(),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Erro ao atualizar perfil");
  await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(json.user));
  return json.user;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/password`, {
    method: "PATCH",
    headers: await getAuthHeaders(),
    body: JSON.stringify({
      currentPassword,
      newPassword,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Erro ao alterar senha");
}
