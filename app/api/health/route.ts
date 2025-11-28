import { NextResponse } from 'next/server';

/**
 * Health check endpoint for Docker and monitoring services
 * Used by Docker HEALTHCHECK and uptime monitors
 */
export async function GET() {
  try {
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    }, { status: 200 });
  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 503 });
  }
}
