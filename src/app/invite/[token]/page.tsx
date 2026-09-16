import { AcceptInvite } from "@/components/AcceptInvite";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return <AcceptInvite token={(await params).token} />;
}
