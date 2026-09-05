import InviteClient from './InviteClient';

export default async function InvitePage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  return <InviteClient token={params.token} />;
}
