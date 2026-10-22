import { getChatGPTUser, chatGPTSignInPath } from "./chatgpt-auth";
import HubApp from "./hub-app";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await getChatGPTUser();
  return <HubApp signedIn={!!user} signInPath={chatGPTSignInPath("/")} />;
}
