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

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
}
