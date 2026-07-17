import AdminModerationDetail from "./AdminModerationDetail";

export default async function AdminModerationDetailPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  return <AdminModerationDetail profileId={profileId} />;
}
