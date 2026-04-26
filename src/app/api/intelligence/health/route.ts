import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

/**
 * Proxy for the background worker health endpoint.
 * Sync.js runs on port 10006.
 */
export async function GET(request: NextRequest) {
  try {
    const response = await fetch("http://127.0.0.1:10006/health", {
      next: { revalidate: 30 } // Cache for 30 seconds
    });
    
    if (!response.ok) {
      return NextResponse.json({ 
        status: "OFFLINE", 
        error: `Worker status server returned ${response.status}` 
      }, { status: 200 });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ 
      status: "OFFLINE", 
      error: "Could not connect to background worker status server" 
    }, { status: 200 });
  }
}
