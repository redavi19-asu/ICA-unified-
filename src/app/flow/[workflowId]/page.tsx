import { notFound } from 'next/navigation';
import { getPublicWorkflow } from '../../../lib/workflow-execution';
import PublicWorkflowClient from './PublicWorkflowClient';

export const dynamic = 'force-dynamic';

export default async function PublicWorkflowPage({
  params,
}: {
  params: Promise<{ workflowId: string }>;
}) {
  const { workflowId } = await params;
  const workflow = await getPublicWorkflow(workflowId);
  if (!workflow) notFound();

  return (
    <PublicWorkflowClient
      workflow={{
        id: workflow.id,
        kind: workflow.kind,
        name: workflow.name,
        organizationName: workflow.organizationName,
        config: workflow.config,
      }}
    />
  );
}
