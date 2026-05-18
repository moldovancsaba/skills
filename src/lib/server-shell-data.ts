import "server-only";

import { cookies } from "next/headers";
import { APP_SESSION_COOKIE, readAppSessionToken } from "@/lib/auth";

export type ShellInitialSession = {
  authenticated: boolean;
  id: string;
  email: string;
  name: string;
  picture?: string;
  user: {
    id: string;
    email: string;
    name: string;
    picture?: string;
  };
} | null;

export async function getShellInitialSession(): Promise<ShellInitialSession> {
  const cookieStore = await cookies();
  const session = readAppSessionToken(cookieStore.get(APP_SESSION_COOKIE)?.value);
  if (!session) return null;

  return {
    authenticated: true,
    id: session.sub,
    email: session.email,
    name: session.name,
    picture: session.picture,
    user: {
      id: session.sub,
      email: session.email,
      name: session.name,
      picture: session.picture,
    },
  };
}
