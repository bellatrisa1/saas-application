import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth";
import { WorkspaceApp } from "@/components/WorkspaceApp";
export default async function Page() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <WorkspaceApp user={user} />;
}
