import { env } from "cloudflare:workers";
import { getAuthenticatedDeviceUser, type DeviceAuthEnv } from "../../../lib/device-auth";
import { saveStudyPresence } from "../../../lib/study-presence";

export async function POST(request: Request) {
  const runtime = env as unknown as DeviceAuthEnv;
  const user = await getAuthenticatedDeviceUser(request, runtime.DB);
  if (!user) return Response.json({ error: "login required" }, { status: 401 });
  const payload = await request.json() as Record<string, unknown>;
  try {
    const presence = await saveStudyPresence(runtime.DB, user.id, payload);
    return Response.json({ saved: true, presence });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "invalid presence" }, { status: 400 });
  }
}
