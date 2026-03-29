/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, convertToModelMessages, UIMessage } from "ai";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const maxDuration = 30;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
);

const openaiProvider = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/**
 * Retrieves the top-5 most relevant document chunks from Supabase pgvector
 * for the latest user message, scoped to the logged-in user.
 */
async function retrieveContext(
  query: string,
  userId: string | undefined,
): Promise<{ context: string; sources: any[] }> {
  const embRes = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: query }),
  });
  const embJson = await embRes.json();
  const embedding = embJson.data?.[0]?.embedding;
  if (!embedding) return { context: "", sources: [] };

  const { data: results, error } = await supabase.rpc("match_documents", {
    query_embedding: JSON.stringify(embedding),
    match_threshold: 0.0,
    match_count: 5,
    owner_id: userId,
  });

  if (error || !results?.length) return { context: "", sources: [] };

  const context = results.map((r: any) => r.content).join("\n---\n");
  return { context, sources: results };
}

export async function POST(req: Request) {
  try {
    const {
      messages,
      conversationId,
    }: { messages: UIMessage[]; conversationId: string } = await req.json();

    const supabaseServer = await createServerClient();
    const {
      data: { user },
    } = await supabaseServer.auth.getUser();

    // Latest user message = what we embed for RAG retrieval
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const query =
      lastUserMsg?.parts
        ?.filter((p: any) => p.type === "text")
        ?.map((p: any) => p.text)
        ?.join(" ") ?? "";

    const { context, sources } = await retrieveContext(query, user?.id);

    const systemPrompt = context
      ? `You are a helpful assistant that answers questions based on the user's uploaded documents.
Use ONLY the context below to answer. If the answer is not in the context, say you don't know.
Cite which document(s) your answer comes from when relevant.

--- DOCUMENT CONTEXT ---
${context}
--- END CONTEXT ---`
      : `You are a helpful assistant. No relevant documents were found for this query. Let the user know they may need to upload relevant documents first.`;

    const result = streamText({
      model: openaiProvider("gpt-4.1-mini"),
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      onFinish: async ({ text }) => {
        if (!user) return;
        const now = new Date().toISOString();
        // Upsert the conversation summary row (one row per conversation)
        await supabase
          .from("search_history")
          .upsert(
            {
              query, // always the opening question as the title
              answer: text, // latest AI reply shown in preview
              sources,
              owner: user.id,
              searched_at: now,
              conversation_id: conversationId,
            },
            { onConflict: "id" },
          )
          .then(({ error: err }) => {
            if (err)
              console.warn("[chat] Failed to upsert history:", err.message);
          });
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (err: any) {
    console.error("[chat route]", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
