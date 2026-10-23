import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { handleHub, type HubRuntime } from "../../../../lib/hub-http";
export const dynamic = "force-dynamic";
const handle = (req: Request) => handleHub(req, { ...env, authenticate: getChatGPTUser } as HubRuntime);
export const GET = handle;
export const POST = handle;
