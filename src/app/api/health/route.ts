import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

export async function GET() {
  try {
    await prisma.organization.count();

    return NextResponse.json({
      ok: true,
      service: 'ica-unified-backend',
      database: 'connected',
    });
  } catch (error) {
    console.error('ICA_HEALTH_DB_ERROR', error);

    return NextResponse.json(
      {
        ok: false,
        service: 'ica-unified-backend',
        database: 'unavailable',
      },
      { status: 503 }
    );
  }
}
