import { redirect } from 'next/navigation';
import { requireSession } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';
import DocumentsClient from './DocumentsClient';

export default async function DocumentsPage() {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(membership.role)) redirect('/my');
  const organizationId = membership.organizationId;

  const documents = await prisma.document.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    include: {
      acknowledgments: {
        select: { acknowledgedAt: true },
      },
    },
  });

  return (
    <DocumentsClient
      organizationName={membership.organization.name}
      role={membership.role}
      documents={documents.map((document) => ({
        id: document.id,
        title: document.title,
        version: document.version,
        requiresAck: document.requiresAck,
        createdAt: document.createdAt.toISOString(),
        acknowledged: document.acknowledgments.filter((item) => item.acknowledgedAt).length,
      }))}
    />
  );
}