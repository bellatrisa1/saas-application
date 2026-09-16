import { z } from "zod";
import { requireUser } from "@/server/auth";
import { respond, body, sameOrigin } from "@/server/http";
import { acceptInvitation } from "@/server/workspaces";
export async function POST(request: Request) {
  return respond(async () => {
    sameOrigin(request);
    const data = z
      .object({ token: z.string().min(20).max(100) })
      .parse(await body(request));
    return acceptInvitation(await requireUser(), data.token);
  });
}
