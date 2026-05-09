// Minimal SSE consumer over fetch streaming. EventSource has limitations
// (no abort signal, no custom events on body errors), so we parse manually.

export interface SSEHandlers {
  onMessage?: (data: string) => void;
  onEvent?: (event: string, data: string) => void;
  signal?: AbortSignal;
}

export async function consumeSSE(url: string, handlers: SSEHandlers): Promise<void> {
  const res = await fetch(url, { signal: handlers.signal });
  if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      dispatch(block, handlers);
      boundary = buffer.indexOf("\n\n");
    }
  }
}

function dispatch(block: string, handlers: SSEHandlers): void {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    // ignore comments/id/retry
  }
  const data = dataLines.join("\n");
  if (event === "message") handlers.onMessage?.(data);
  else handlers.onEvent?.(event, data);
}
