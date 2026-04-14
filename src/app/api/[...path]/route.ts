import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "https://trena-frenular-fixatedly.ngrok-free.dev";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    const searchParams = request.nextUrl.searchParams.toString();
    const url = `${BACKEND_URL}/api/${path.join("/")}${searchParams ? `?${searchParams}` : ""}`;

    const response = await fetch(url, {
        headers: { "ngrok-skip-browser-warning": "1" },
    });

    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("text/event-stream")) {
        return new NextResponse(response.body, {
            status: response.status,
            headers: {
                "content-type": contentType,
                "cache-control": "no-cache",
                "x-accel-buffering": "no",
            },
        });
    }

    if (!contentType.includes("application/json")) {
        const text = await response.text();
        console.error(`[proxy] Non-JSON response (${response.status}) from ${url}:`, text.slice(0, 300));
        return NextResponse.json(
            { detail: `Backend returned non-JSON (status ${response.status}). Is FastAPI running?` },
            { status: 502 }
        );
    }

    return new NextResponse(response.body, {
        status: response.status,
        headers: { "content-type": contentType }
    });
}
